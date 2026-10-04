import { describe, expect, it, vi } from "vitest";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SignalsResponse, type Signal } from "@firedrift/domain";
import { createPostSignalsHandler } from "../src/handlers/postSignals";
import { createDynamoDbSignalStore, createMemorySignalStore } from "../src/signals/signalStore";
import { body, domainFixture, event, PROFILE_ID } from "./profileFakes";

const batch = domainFixture("rest/signals.body.json") as { signals: Signal[] };

describe("POST /profiles/{profileId}/signals", () => {
  const setup = () => {
    const signals = createMemorySignalStore();
    return { signals, post: createPostSignalsHandler(() => ({ signals })) };
  };

  it("accepts a batch, then counts the same batch as duplicates", async () => {
    const { post, signals } = setup();
    const first = SignalsResponse.parse(body(await post(event(undefined, { body: batch }))));
    const again = SignalsResponse.parse(body(await post(event(undefined, { body: batch }))));
    expect(first).toEqual({ accepted: 4, duplicates: 0 });
    expect(again).toEqual({ accepted: 0, duplicates: 4 });
    expect(await signals.listForProfile(PROFILE_ID)).toHaveLength(4);
  });

  it("rejects more than 50 signals", async () => {
    const { post } = setup();
    const tooMany = { signals: Array.from({ length: 51 }, () => batch.signals[0]) };
    const result = await post(event(undefined, { body: tooMany }));
    expect(result.statusCode).toBe(400);
    expect(body(result).error.code).toBe("invalid_body");
  });

  it("rejects a dwell signal without surface", async () => {
    const { post } = setup();
    const dwell = { ...batch.signals[1], surface: undefined };
    const result = await post(event(undefined, { body: { signals: [dwell] } }));
    expect(result.statusCode).toBe(400);
  });
});

describe("dynamodb signal store", () => {
  it("writes conditional puts with a 30-day ttl and counts conditional failures as duplicates", async () => {
    vi.setSystemTime(1_000_000_000);
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ConditionalCheckFailedException({ message: "exists", $metadata: {} }));
    const store = createDynamoDbSignalStore({ send } as unknown as DynamoDBDocumentClient, "table");

    const result = await store.putNew(PROFILE_ID, batch.signals.slice(0, 2));

    expect(result).toEqual({ accepted: 1, duplicates: 1 });
    const input = send.mock.calls[0]?.[0].input;
    expect(input).toMatchObject({
      TableName: "table",
      ConditionExpression: "attribute_not_exists(pk)",
      Item: { pk: `PROFILE#${PROFILE_ID}`, sk: `SIGNAL#${batch.signals[0]!.signalId}`, ttl: 1_000_000 + 30 * 24 * 3600 },
    });
    vi.useRealTimers();
  });

  it("throws other DynamoDB errors", async () => {
    const send = vi.fn().mockRejectedValue(new Error("throttled"));
    const store = createDynamoDbSignalStore({ send } as unknown as DynamoDBDocumentClient, "table");
    await expect(store.putNew(PROFILE_ID, batch.signals.slice(0, 1))).rejects.toThrow("throttled");
  });
});
