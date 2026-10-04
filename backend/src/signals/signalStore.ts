import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Signal, SignalsResponse } from "@firedrift/domain";

export const SIGNAL_TTL_SECONDS = 30 * 24 * 3600;

export interface SignalStore {
  /** Saves the signals not seen before. Idempotent by `signalId`. */
  putNew(profileId: string, signals: Signal[]): Promise<SignalsResponse>;
  listForProfile(profileId: string): Promise<Signal[]>;
}

const countResults = (results: boolean[]): SignalsResponse => {
  const accepted = results.filter(Boolean).length;
  return { accepted, duplicates: results.length - accepted };
};

/**
 * Signal items: `pk = "PROFILE#<profileId>"`, `sk = "SIGNAL#<signalId>"`, the
 * `Signal` fields and `ttl`. A conditional put makes resent batches harmless.
 */
export const createDynamoDbSignalStore = (
  doc: DynamoDBDocumentClient,
  tableName: string,
): SignalStore => ({
  async putNew(profileId, signals) {
    const ttl = Math.floor(Date.now() / 1000) + SIGNAL_TTL_SECONDS;
    const results = await Promise.all(
      signals.map(async (signal) => {
        try {
          await doc.send(
            new PutCommand({
              TableName: tableName,
              Item: { pk: `PROFILE#${profileId}`, sk: `SIGNAL#${signal.signalId}`, ...signal, ttl },
              ConditionExpression: "attribute_not_exists(pk)",
            }),
          );
          return true;
        } catch (cause) {
          if (cause instanceof ConditionalCheckFailedException) return false;
          throw cause;
        }
      }),
    );
    return countResults(results);
  },

  async listForProfile(profileId) {
    const signals: Signal[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const page = await doc.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: { ":pk": `PROFILE#${profileId}`, ":prefix": "SIGNAL#" },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const { pk: _pk, sk: _sk, ttl: _ttl, ...signal } of page.Items ?? []) {
        signals.push(signal as Signal);
      }
      startKey = page.LastEvaluatedKey;
    } while (startKey);
    return signals;
  },
});

/** In-memory signals for the local API and tests. */
export const createMemorySignalStore = (): SignalStore => {
  const byProfile = new Map<string, Map<string, Signal>>();
  return {
    async putNew(profileId, signals) {
      const stored = byProfile.get(profileId) ?? new Map<string, Signal>();
      byProfile.set(profileId, stored);
      const results = signals.map((signal) => {
        if (stored.has(signal.signalId)) return false;
        stored.set(signal.signalId, signal);
        return true;
      });
      return countResults(results);
    },
    async listForProfile(profileId) {
      return [...(byProfile.get(profileId)?.values() ?? [])];
    },
  };
};
