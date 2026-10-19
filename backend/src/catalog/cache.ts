import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

/** A key-value cache for TMDB responses. Values are JSON strings. */
export interface Cache {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Per-Lambda-instance cache. Saves DynamoDB reads on warm invocations. */
export const createMemoryCache = (maxEntries = 500): Cache => {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= nowSeconds()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: nowSeconds() + ttlSeconds });
    },
  };
};

/**
 * TMDB cache items in the single DynamoDB table:
 * `pk = "TMDB#<request>"`, `sk = "CACHE"`, `body` (JSON string), `ttl` (epoch seconds).
 * DynamoDB TTL deletes expired items late, so `get` also checks `ttl`.
 */
export const createDynamoDbCache = (doc: DynamoDBDocumentClient, tableName: string): Cache => ({
  async get(key) {
    const { Item } = await doc.send(
      new GetCommand({ TableName: tableName, Key: { pk: `TMDB#${key}`, sk: "CACHE" } }),
    );
    if (!Item || typeof Item.body !== "string") return undefined;
    if (typeof Item.ttl === "number" && Item.ttl <= nowSeconds()) return undefined;
    return Item.body;
  },
  async set(key, value, ttlSeconds) {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: { pk: `TMDB#${key}`, sk: "CACHE", body: value, ttl: nowSeconds() + ttlSeconds },
      }),
    );
  },
});

/** Reads the first cache that has the key and fills the faster ones on the way back. */
export const createLayeredCache = (...layers: Cache[]): Cache => ({
  async get(key) {
    for (const [index, layer] of layers.entries()) {
      const value = await layer.get(key);
      if (value !== undefined) {
        // Refill faster layers with a short TTL; the slow layer keeps the real expiry.
        await Promise.all(layers.slice(0, index).map((l) => l.set(key, value, 300)));
        return value;
      }
    }
    return undefined;
  },
  async set(key, value, ttlSeconds) {
    await Promise.all(layers.map((layer) => layer.set(key, value, ttlSeconds)));
  },
});
