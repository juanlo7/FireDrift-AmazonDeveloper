import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { PoolResponse, TitleType } from "@firedrift/domain";

export const POOL_TTL_SECONDS = 7 * 24 * 3600;

/** What is kept of a past pool: enough for the recency cooldown. */
export interface PoolRecord {
  poolId: string;
  createdAt: string;
  titles: { type: TitleType; tmdbId: number }[];
}

export interface PoolStore {
  save(profileId: string, pool: PoolResponse): Promise<void>;
  /** The `count` newest pools, newest first. */
  listRecent(profileId: string, count: number): Promise<PoolRecord[]>;
}

const newestFirst = (a: PoolRecord, b: PoolRecord) => b.createdAt.localeCompare(a.createdAt);

/**
 * Pool items: `pk = "PROFILE#<profileId>"`, `sk = "POOL#<poolId>"`, with
 * `algorithmVersion`, the title IDs and `ttl`. Full cards are not stored: TMDB
 * data stays in the TMDB cache.
 */
export const createDynamoDbPoolStore = (doc: DynamoDBDocumentClient, tableName: string): PoolStore => ({
  async save(profileId, pool) {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: `PROFILE#${profileId}`,
          sk: `POOL#${pool.poolId}`,
          algorithmVersion: pool.algorithmVersion,
          titles: pool.titles.map(({ type, tmdbId }) => ({ type, tmdbId })),
          createdAt: new Date().toISOString(),
          ttl: Math.floor(Date.now() / 1000) + POOL_TTL_SECONDS,
        },
      }),
    );
  },

  async listRecent(profileId, count) {
    // Pools live 7 days, so a profile has few of them; sort by createdAt here.
    const { Items } = await doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": `PROFILE#${profileId}`, ":prefix": "POOL#" },
        ProjectionExpression: "sk, createdAt, titles",
      }),
    );
    return (Items ?? [])
      .map((item) => ({
        poolId: String(item.sk).slice("POOL#".length),
        createdAt: String(item.createdAt ?? ""),
        titles: Array.isArray(item.titles) ? item.titles : [],
      }))
      .sort(newestFirst)
      .slice(0, count);
  },
});

/** In-memory pools for the local API and tests. */
export const createMemoryPoolStore = (): PoolStore & { saved: PoolResponse[] } => {
  const saved: PoolResponse[] = [];
  const records = new Map<string, PoolRecord[]>();
  return {
    saved,
    async save(profileId, pool) {
      saved.push(pool);
      const record: PoolRecord = {
        poolId: pool.poolId,
        createdAt: new Date().toISOString(),
        titles: pool.titles.map(({ type, tmdbId }) => ({ type, tmdbId })),
      };
      records.set(profileId, [record, ...(records.get(profileId) ?? [])]);
    },
    async listRecent(profileId, count) {
      return (records.get(profileId) ?? []).slice(0, count);
    },
  };
};
