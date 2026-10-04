import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { PoolResponse } from "@firedrift/domain";

export const POOL_TTL_SECONDS = 7 * 24 * 3600;

export interface PoolStore {
  save(profileId: string, pool: PoolResponse): Promise<void>;
}

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
});

/** In-memory pools for the local API and tests. */
export const createMemoryPoolStore = (): PoolStore & { saved: PoolResponse[] } => {
  const saved: PoolResponse[] = [];
  return {
    saved,
    async save(_profileId, pool) {
      saved.push(pool);
    },
  };
};
