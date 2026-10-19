import { describe, expect, it } from "vitest";
import { ApiError, PoolResponse } from "@firedrift/domain";
import { createGetPoolHandler } from "../src/handlers/getPool";
import { createPutProfileHandler } from "../src/handlers/putProfile";
import { createMemoryPoolStore } from "../src/pool/poolStore";
import { createMemoryProfileStore } from "../src/profile/profileStore";
import { createMemorySignalStore } from "../src/signals/signalStore";
import { createMemoryConfigStore } from "../src/taste/configStore";
import { createMemoryWeightStore } from "../src/weights/weightStore";
import { body, createFakeCatalog, createFakeTmdb, domainFixture, event, PROFILE_ID } from "./profileFakes";

const setup = () => {
  const { tmdb, discover } = createFakeTmdb();
  const { catalog } = createFakeCatalog();
  const runtime = {
    tmdb,
    catalog,
    profiles: createMemoryProfileStore(),
    signals: createMemorySignalStore(),
    pools: createMemoryPoolStore(),
    weights: createMemoryWeightStore(),
    // These tests are about the routes; the taste algorithm has its own tests.
    config: createMemoryConfigStore({ algorithmVersion: "cold-start-1" }),
  };
  const deps = () => runtime;
  return { runtime, discover, putProfile: createPutProfileHandler(deps), getPool: createGetPoolHandler(deps) };
};

describe("PUT /profiles/{profileId}", () => {
  it("saves the profile and answers 204", async () => {
    const { putProfile, runtime } = setup();
    const profile = domainFixture("rest/profile-put.body.json");
    const result = await putProfile(event(undefined, { body: profile }));
    expect(result.statusCode).toBe(204);
    expect(await runtime.profiles.get(PROFILE_ID)).toEqual(profile);
  });

  it("accepts a base64 body", async () => {
    const { putProfile } = setup();
    const result = await putProfile(
      event(undefined, { body: domainFixture("rest/profile-put.body.json"), base64: true }),
    );
    expect(result.statusCode).toBe(204);
  });

  it.each([
    ["a profileId that is not a UUID", event({ profileId: "abc" }, { body: {} }), "invalid_profile_id"],
    ["a body that is not JSON", event(undefined, { body: "{" }), "invalid_json"],
    ["a body that breaks the contract", event(undefined, { body: { country: "Spain" } }), "invalid_body"],
  ])("rejects %s with 400", async (_name, request, code) => {
    const { putProfile } = setup();
    const result = await putProfile(request);
    expect(result.statusCode).toBe(400);
    expect(ApiError.parse(body(result)).error.code).toBe(code);
  });
});

describe("GET /profiles/{profileId}/pool", () => {
  it("returns a cold start pool that matches the contract and saves it", async () => {
    const { getPool, runtime } = setup();
    const result = await getPool(event());
    expect(result.statusCode).toBe(200);
    const pool = PoolResponse.parse(body(result));
    expect(pool.titles).toHaveLength(20);
    expect(pool.algorithmVersion).toBe("cold-start-1");
    expect(runtime.pools.saved[0]?.poolId).toBe(pool.poolId);
  });

  it("uses ES and all services before the profile exists", async () => {
    const { getPool, discover } = setup();
    await getPool(event());
    expect(discover.mock.calls[0]?.[1]).toMatchObject({ watch_region: "ES" });
    expect(discover.mock.calls[0]?.[1]).not.toHaveProperty("with_watch_providers");
  });

  it("uses the saved profile", async () => {
    const { getPool, putProfile, discover } = setup();
    await putProfile(event(undefined, { body: { country: "US", services: [8], showEverything: false } }));
    await getPool(event());
    expect(discover.mock.calls[0]?.[1]).toMatchObject({ watch_region: "US", with_watch_providers: "8" });
  });

  it("leaves out titles the profile already reacted to", async () => {
    const { getPool, runtime } = setup();
    const { signals } = domainFixture("rest/signals.body.json") as { signals: never[] };
    await runtime.signals.putNew(PROFILE_ID, signals);
    const first = PoolResponse.parse(body(await getPool(event(undefined, { query: { size: "40" } }))));
    const seen = new Set(signals.map((s: { type: string; tmdbId: number }) => `${s.type}:${s.tmdbId}`));
    expect(first.titles.some((t) => seen.has(`${t.type}:${t.tmdbId}`))).toBe(false);
  });

  it.each(["0", "41", "ten"])("rejects size=%s", async (size) => {
    const { getPool } = setup();
    const result = await getPool(event(undefined, { query: { size } }));
    expect(result.statusCode).toBe(400);
    expect(body(result).error.code).toBe("invalid_size");
  });
});
