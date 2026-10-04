import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

/** What the catalog needs from a device profile. */
export interface ProfileServices {
  services: number[];
  showEverything: boolean;
}

/** Read side of the device profile. Profiles are written by `PUT /profiles/{profileId}` (#45). */
export interface ProfileStore {
  getServices(profileId: string): Promise<ProfileServices | null>;
}

/**
 * Profile item in the single table: `pk = "PROFILE#<profileId>"`, `sk = "PROFILE"`,
 * with `services` (number list) and `showEverything`. Keep in line with #45.
 */
export const createDynamoDbProfileStore = (
  doc: DynamoDBDocumentClient,
  tableName: string,
): ProfileStore => ({
  async getServices(profileId) {
    const { Item } = await doc.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: `PROFILE#${profileId}`, sk: "PROFILE" },
        ProjectionExpression: "services, showEverything",
      }),
    );
    if (!Item) return null;
    const services = Array.isArray(Item.services)
      ? Item.services.filter((id): id is number => typeof id === "number")
      : [];
    return { services, showEverything: Item.showEverything === true };
  },
});
