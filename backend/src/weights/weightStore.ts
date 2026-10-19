import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  BatchGetCommand,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { WeightChange } from "@firedrift/domain";
import type { WeightMap } from "./summary";

export const MAX_KEPT_CHANGES = 20;

export interface WeightLayers {
  learned: WeightMap;
  /** Feature labels of the learned layer (#46). */
  labels: Record<string, string>;
  /** Stored butler adjustment, before decay. */
  adjustment: WeightMap;
  /** When the adjustment was last written; decay counts from here. */
  adjustmentUpdatedAt: string | null;
}

const EMPTY_LAYERS: WeightLayers = { learned: {}, labels: {}, adjustment: {}, adjustmentUpdatedAt: null };

export interface WeightStore {
  getLayers(profileId: string): Promise<WeightLayers>;
  /** Replaces the learned layer, recomputed from signals on every pool (#46). */
  saveLearned(profileId: string, weights: WeightMap, labels: Record<string, string>): Promise<void>;
  /** Newest first, at most `MAX_KEPT_CHANGES`. */
  listChanges(profileId: string): Promise<WeightChange[]>;
  /** Saves a butler change and the adjustment layer it produced (#47). */
  addChange(profileId: string, change: WeightChange, adjustment: WeightMap): Promise<void>;
  /** Marks the change undone and saves the reverted adjustment layer, atomically. */
  undoChange(profileId: string, change: WeightChange, adjustment: WeightMap): Promise<void>;
  /** Empties the adjustment layer and marks the given changes undone, atomically. */
  resetAdjustment(profileId: string, pending: WeightChange[]): Promise<void>;
}

const pk = (profileId: string) => `PROFILE#${profileId}`;
const LEARNED_SK = "WEIGHTS#LEARNED";
const ADJUST_SK = "WEIGHTS#ADJUST";
const changeSk = (change: WeightChange) => `CHANGE#${change.at}#${change.changeId}`;

const toWeightMap = (value: unknown): WeightMap =>
  value && typeof value === "object" ? (value as WeightMap) : {};
const toLabels = (value: unknown): Record<string, string> =>
  value && typeof value === "object" ? (value as Record<string, string>) : {};

/**
 * Weight items, all in the profile partition:
 * `WEIGHTS#LEARNED` (`weights`, `labels`, `updatedAt`), `WEIGHTS#ADJUST`
 * (`weights`, `updatedAt`) and `CHANGE#<at>#<changeId>` with the `WeightChange` fields.
 */
export const createDynamoDbWeightStore = (
  doc: DynamoDBDocumentClient,
  tableName: string,
): WeightStore => {
  const adjustmentPut = (profileId: string, adjustment: WeightMap) => ({
    TableName: tableName,
    Item: { pk: pk(profileId), sk: ADJUST_SK, weights: adjustment, updatedAt: new Date().toISOString() },
  });

  const markUndone = (profileId: string, change: WeightChange) => ({
    Update: {
      TableName: tableName,
      Key: { pk: pk(profileId), sk: changeSk(change) },
      UpdateExpression: "SET undone = :true",
      ConditionExpression: "undone = :false",
      ExpressionAttributeValues: { ":true": true, ":false": false },
    },
  });

  const changeItems = async (profileId: string) => {
    const { Items } = await doc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": pk(profileId), ":prefix": "CHANGE#" },
        ScanIndexForward: false,
      }),
    );
    return Items ?? [];
  };

  return {
    async getLayers(profileId) {
      const { Responses } = await doc.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: [
                { pk: pk(profileId), sk: LEARNED_SK },
                { pk: pk(profileId), sk: ADJUST_SK },
              ],
            },
          },
        }),
      );
      const items = Responses?.[tableName] ?? [];
      const learned = items.find((item) => item.sk === LEARNED_SK);
      const adjustment = items.find((item) => item.sk === ADJUST_SK);
      return {
        learned: toWeightMap(learned?.weights),
        labels: toLabels(learned?.labels),
        adjustment: toWeightMap(adjustment?.weights),
        adjustmentUpdatedAt: typeof adjustment?.updatedAt === "string" ? adjustment.updatedAt : null,
      };
    },

    async saveLearned(profileId, weights, labels) {
      await doc.send(
        new PutCommand({
          TableName: tableName,
          Item: { pk: pk(profileId), sk: LEARNED_SK, weights, labels, updatedAt: new Date().toISOString() },
        }),
      );
    },

    async listChanges(profileId) {
      const items = await changeItems(profileId);
      return items.slice(0, MAX_KEPT_CHANGES).map(({ pk: _pk, sk: _sk, ...change }) => change as WeightChange);
    },

    async addChange(profileId, change, adjustment) {
      await doc.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName: tableName, Item: { pk: pk(profileId), sk: changeSk(change), ...change } } },
            { Put: adjustmentPut(profileId, adjustment) },
          ],
        }),
      );
      const stale = (await changeItems(profileId)).slice(MAX_KEPT_CHANGES);
      await Promise.all(
        stale.map((item) =>
          doc.send(new DeleteCommand({ TableName: tableName, Key: { pk: item.pk, sk: item.sk } })),
        ),
      );
    },

    async undoChange(profileId, change, adjustment) {
      await doc.send(
        new TransactWriteCommand({
          TransactItems: [
            markUndone(profileId, change),
            { Put: adjustmentPut(profileId, adjustment) },
          ],
        }),
      );
    },

    async resetAdjustment(profileId, pending) {
      await doc.send(
        new TransactWriteCommand({
          TransactItems: [
            ...pending.map((change) => markUndone(profileId, change)),
            { Put: adjustmentPut(profileId, {}) },
          ],
        }),
      );
    },
  };
};

/** In-memory weights for the local API and tests. */
export const createMemoryWeightStore = (seed: Record<string, Partial<WeightLayers>> = {}): WeightStore => {
  const layers = new Map<string, WeightLayers>(
    Object.entries(seed).map(([id, layer]) => [id, { ...EMPTY_LAYERS, ...layer }]),
  );
  const changes = new Map<string, WeightChange[]>();
  const layersOf = (id: string) => layers.get(id) ?? EMPTY_LAYERS;
  const setAdjustment = (id: string, adjustment: WeightMap) =>
    layers.set(id, { ...layersOf(id), adjustment, adjustmentUpdatedAt: new Date().toISOString() });
  const markUndone = (id: string, changeIds: string[]) =>
    changes.set(
      id,
      (changes.get(id) ?? []).map((c) => (changeIds.includes(c.changeId) ? { ...c, undone: true } : c)),
    );

  return {
    async getLayers(profileId) {
      return layersOf(profileId);
    },
    async saveLearned(profileId, learned, labels) {
      layers.set(profileId, { ...layersOf(profileId), learned, labels });
    },
    async listChanges(profileId) {
      return [...(changes.get(profileId) ?? [])];
    },
    async addChange(profileId, change, adjustment) {
      changes.set(profileId, [change, ...(changes.get(profileId) ?? [])].slice(0, MAX_KEPT_CHANGES));
      setAdjustment(profileId, adjustment);
    },
    async undoChange(profileId, change, adjustment) {
      markUndone(profileId, [change.changeId]);
      setAdjustment(profileId, adjustment);
    },
    async resetAdjustment(profileId, pending) {
      markUndone(profileId, pending.map((change) => change.changeId));
      setAdjustment(profileId, {});
    },
  };
};
