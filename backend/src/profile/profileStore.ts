import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ProfilePutBody } from "@firedrift/domain";

/** What the catalog needs from a device profile. */
export interface ProfileServices {
  services: number[];
  showEverything: boolean;
}

/** Read side of the device profile. Profiles are written by `PUT /profiles/{profileId}` (#44). */
export interface ProfileStore {
  getServices(profileId: string): Promise<ProfileServices | null>;
}

/** The whole device profile, for the routes that write it and build pools. */
export type Profile = ProfilePutBody;

/** Used before the device saves its profile: the feed never waits for `PUT /profiles`. */
export const DEFAULT_PROFILE: Profile = { country: "ES", services: [], showEverything: false };

export interface ProfileRepository extends ProfileStore {
  get(profileId: string): Promise<Profile | null>;
  put(profileId: string, profile: Profile): Promise<void>;
}

const profileKey = (profileId: string) => ({ pk: `PROFILE#${profileId}`, sk: "PROFILE" });

const toNumbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((id): id is number => typeof id === "number") : [];

/**
 * Profile item in the single table: `pk = "PROFILE#<profileId>"`, `sk = "PROFILE"`,
 * with `country`, `services` (number list), `showEverything` and `updatedAt`.
 */
export const createDynamoDbProfileStore = (
  doc: DynamoDBDocumentClient,
  tableName: string,
): ProfileRepository => ({
  async getServices(profileId) {
    const { Item } = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: profileKey(profileId),
        ProjectionExpression: "services, showEverything",
      }),
    );
    if (!Item) return null;
    return { services: toNumbers(Item.services), showEverything: Item.showEverything === true };
  },
  async get(profileId) {
    const { Item } = await doc.send(new GetCommand({ TableName: tableName, Key: profileKey(profileId) }));
    if (!Item || typeof Item.country !== "string") return null;
    return {
      country: Item.country,
      services: toNumbers(Item.services),
      showEverything: Item.showEverything === true,
    };
  },
  async put(profileId, profile) {
    await doc.send(
      new PutCommand({
        TableName: tableName,
        Item: { ...profileKey(profileId), ...profile, updatedAt: new Date().toISOString() },
      }),
    );
  },
});

/** In-memory profiles for the local API and tests. */
export const createMemoryProfileStore = (): ProfileRepository => {
  const profiles = new Map<string, Profile>();
  return {
    async getServices(profileId) {
      const profile = profiles.get(profileId);
      return profile ? { services: profile.services, showEverything: profile.showEverything } : null;
    },
    async get(profileId) {
      return profiles.get(profileId) ?? null;
    },
    async put(profileId, profile) {
      profiles.set(profileId, profile);
    },
  };
};
