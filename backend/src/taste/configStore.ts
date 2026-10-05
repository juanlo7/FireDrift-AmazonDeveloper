import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_TASTE_CONFIG, mergeConfig, type TasteConfig, type TasteConfigOverrides } from "./config";

export interface ConfigStore {
  getTasteConfig(): Promise<TasteConfig>;
}

const CACHE_MS = 60_000;

/**
 * Config item: `pk = "CONFIG"`, `sk = "ACTIVE"`, attribute `taste` with any
 * `TasteConfig` fields to override. Read at most once a minute per Lambda instance.
 */
export const createDynamoDbConfigStore = (doc: DynamoDBDocumentClient, tableName: string): ConfigStore => {
  let cached: { config: TasteConfig; at: number } | undefined;
  return {
    async getTasteConfig() {
      if (cached && Date.now() - cached.at < CACHE_MS) return cached.config;
      const { Item } = await doc.send(
        new GetCommand({ TableName: tableName, Key: { pk: "CONFIG", sk: "ACTIVE" } }),
      );
      const config = mergeConfig(DEFAULT_TASTE_CONFIG, Item?.taste);
      cached = { config, at: Date.now() };
      return config;
    },
  };
};

export const createMemoryConfigStore = (overrides: TasteConfigOverrides = {}): ConfigStore => ({
  async getTasteConfig() {
    return mergeConfig(DEFAULT_TASTE_CONFIG, overrides);
  },
});
