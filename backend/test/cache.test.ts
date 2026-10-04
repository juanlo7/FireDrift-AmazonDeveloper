import { afterEach, describe, expect, it, vi } from "vitest";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createDynamoDbCache, createLayeredCache, createMemoryCache } from "../src/catalog/cache";

afterEach(() => vi.useRealTimers());

describe("memory cache", () => {
  it("expires entries after their TTL", async () => {
    vi.useFakeTimers({ now: 0 });
    const cache = createMemoryCache();
    await cache.set("k", "v", 10);
    expect(await cache.get("k")).toBe("v");
    vi.setSystemTime(11_000);
    expect(await cache.get("k")).toBeUndefined();
  });

  it("drops the oldest entry when full", async () => {
    const cache = createMemoryCache(2);
    await cache.set("a", "1", 60);
    await cache.set("b", "2", 60);
    await cache.set("c", "3", 60);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("c")).toBe("3");
  });
});

describe("dynamodb cache", () => {
  const fakeDoc = (item?: Record<string, unknown>) => {
    const send = vi.fn(async (_command: unknown) => ({ Item: item }));
    return { doc: { send } as unknown as DynamoDBDocumentClient, send };
  };

  it("writes the item with pk, sk, body and an epoch ttl", async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { doc, send } = fakeDoc();
    await createDynamoDbCache(doc, "table").set("/tv/1?language=en-US", "{}", 60);

    const input = (send.mock.calls[0]?.[0] as { input: Record<string, unknown> }).input;
    expect(input).toEqual({
      TableName: "table",
      Item: { pk: "TMDB#/tv/1?language=en-US", sk: "CACHE", body: "{}", ttl: 1060 },
    });
  });

  it("ignores items whose ttl has passed but are not deleted yet", async () => {
    vi.useFakeTimers({ now: 2_000_000 });
    const { doc } = fakeDoc({ body: "{}", ttl: 1999 });
    expect(await createDynamoDbCache(doc, "table").get("k")).toBeUndefined();
  });
});

describe("layered cache", () => {
  it("reads through to the slow layer and refills the fast one", async () => {
    const fast = createMemoryCache();
    const slow = createMemoryCache();
    await slow.set("k", "v", 3600);

    const cache = createLayeredCache(fast, slow);
    expect(await cache.get("k")).toBe("v");
    expect(await fast.get("k")).toBe("v");
  });
});
