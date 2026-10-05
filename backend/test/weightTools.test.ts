import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GetWeightsOutput, RankedPicksOutput, UpdateWeightsOutput, type ApiError } from "@firedrift/domain";
import { createGetWeightsTool } from "../src/handlers/tools/getWeights";
import { createRankedPicksTool } from "../src/handlers/tools/rankedPicks";
import { createUpdateWeightsTool } from "../src/handlers/tools/updateWeights";
import { createMemoryPoolStore } from "../src/pool/poolStore";
import { DEFAULT_PROFILE, createMemoryProfileStore } from "../src/profile/profileStore";
import { createMemorySignalStore } from "../src/signals/signalStore";
import { buildTastePool } from "../src/taste/buildPool";
import { DEFAULT_TASTE_CONFIG } from "../src/taste/config";
import { createMemoryConfigStore } from "../src/taste/configStore";
import { limitChange } from "../src/weights/limits";
import { createMemoryWeightStore } from "../src/weights/weightStore";
import { createWeightsService } from "../src/weights/weightsService";
import { domainFixture, PROFILE_ID } from "./profileFakes";
import { createTasteWorld, NOW, signal } from "./tasteWorld";

const limits = DEFAULT_TASTE_CONFIG.butler;
const isError = (result: unknown): result is ApiError =>
  typeof result === "object" && result !== null && "error" in result;

describe("update_weights limits (FR-5)", () => {
  it("caps a delta above the limit and reports it as clamped", () => {
    const result = limitChange([{ feature: "genre:27", delta: -0.8 }], {}, limits);
    // If this fails, the model can move the taste more than the tool allows.
    expect(result.applied).toEqual([{ feature: "genre:27", delta: -limits.maxDelta }]);
    expect(Math.abs(result.applied[0]!.delta)).toBeLessThanOrEqual(limits.maxDelta);
    expect(result.clamped).toEqual(["genre:27"]);
  });

  it("applies at most maxChanges features and reports the rest", () => {
    const requested = [1, 2, 3, 4, 5].map((i) => ({ feature: `genre:${i}`, delta: 0.1 }));
    const result = limitChange(requested, {}, limits);
    expect(result.applied.map((d) => d.feature)).toEqual(["genre:1", "genre:2", "genre:3"]);
    expect(result.clamped).toEqual(["genre:4", "genre:5"]);
  });

  it("keeps the adjustment inside the range, on top of the current value", () => {
    const result = limitChange([{ feature: "genre:28", delta: 0.5 }], { "genre:28": 0.8 }, limits);
    expect(result.applied).toEqual([{ feature: "genre:28", delta: 0.2 }]);
    expect(result.adjustment["genre:28"]).toBe(1);
    expect(result.clamped).toEqual(["genre:28"]);
  });

  it("sums repeated features before the limits", () => {
    const result = limitChange(
      [
        { feature: "genre:35", delta: 0.2 },
        { feature: "genre:35", delta: 0.2 },
      ],
      {},
      limits,
    );
    expect(result.applied).toEqual([{ feature: "genre:35", delta: 0.4 }]);
    expect(result.clamped).toEqual([]);
  });

  it("applies nothing when the range is already reached", () => {
    const result = limitChange([{ feature: "genre:27", delta: -0.3 }], { "genre:27": -1 }, limits);
    expect(result.applied).toEqual([]);
    expect(result.clamped).toEqual(["genre:27"]);
  });
});

describe("weight tools", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const weights = createMemoryWeightStore({ [PROFILE_ID]: { learned: { "genre:27": 0.9 }, labels: { "genre:27": "Horror" } } });
    const config = createMemoryConfigStore();
    const deps = () => ({ weights, config });
    return { weights, getWeights: createGetWeightsTool(deps), updateWeights: createUpdateWeightsTool(deps) };
  };

  it("update_weights clamps the contract fixture, writes only the adjustment layer and can be undone", async () => {
    const { weights, updateWeights } = setup();
    const result = await updateWeights(domainFixture("tools/update-weights.input.json"));

    const output = UpdateWeightsOutput.parse(result);
    expect(output.change.changes).toEqual([{ feature: "genre:27", delta: -0.5 }]);
    expect(output.clamped).toEqual(["genre:27"]);
    expect(output.change.reason).toBe("You said you are tired of horror.");
    const layers = await weights.getLayers(PROFILE_ID);
    expect(layers.learned).toEqual({ "genre:27": 0.9 });
    expect(layers.adjustment).toEqual({ "genre:27": -0.5 });

    const undone = await createWeightsService(weights).undo(PROFILE_ID);
    expect(undone.likes).toEqual([{ feature: "genre:27", label: "Horror", weight: 0.9 }]);
  });

  it("matches the shape of the contract fixture", async () => {
    const { updateWeights } = setup();
    const result = UpdateWeightsOutput.parse(await updateWeights(domainFixture("tools/update-weights.input.json")));
    const fixture = UpdateWeightsOutput.parse(domainFixture("tools/update-weights.output.json"));
    expect(result.change.changes).toEqual(fixture.change.changes);
    expect(result.clamped).toEqual(fixture.clamped);
  });

  it("keeps the last 20 changes", async () => {
    const { weights, updateWeights } = setup();
    for (let i = 0; i < 22; i++) {
      await updateWeights({ profileId: PROFILE_ID, changes: [{ feature: `keyword:${i}`, delta: 0.1 }], reason: `r${i}` });
    }
    const changes = await weights.listChanges(PROFILE_ID);
    expect(changes).toHaveLength(20);
    expect(changes[0]?.reason).toBe("r21");
  });

  it("get_weights returns the summary with the last change", async () => {
    const { getWeights, updateWeights } = setup();
    await updateWeights(domainFixture("tools/update-weights.input.json"));
    const summary = GetWeightsOutput.parse(await getWeights({ profileId: PROFILE_ID }));
    expect(summary.likes).toEqual([{ feature: "genre:27", label: "Horror", weight: 0.4 }]);
    expect(summary.lastChange?.changes).toEqual([{ feature: "genre:27", delta: -0.5 }]);
  });

  it.each([
    ["no profileId", { changes: [{ feature: "genre:27", delta: -0.1 }], reason: "x" }],
    ["a profileId that is not a UUID", { profileId: "p-1", changes: [{ feature: "genre:27", delta: -0.1 }], reason: "x" }],
    ["a feature key out of the contract", { profileId: PROFILE_ID, changes: [{ feature: "mood:dark", delta: -0.1 }], reason: "x" }],
    ["no reason", { profileId: PROFILE_ID, changes: [{ feature: "genre:27", delta: -0.1 }], reason: "" }],
  ])("returns invalid_input for %s, without throwing", async (_name, input) => {
    const { updateWeights } = setup();
    const result = await updateWeights(input);
    expect(isError(result) && result.error.code).toBe("invalid_input");
  });

  it("returns invalid_change when the limits leave nothing to change", async () => {
    const { updateWeights } = setup();
    await updateWeights({ profileId: PROFILE_ID, changes: [{ feature: "genre:18", delta: -0.5 }], reason: "a" });
    await updateWeights({ profileId: PROFILE_ID, changes: [{ feature: "genre:18", delta: -0.5 }], reason: "b" });
    const result = await updateWeights({ profileId: PROFILE_ID, changes: [{ feature: "genre:18", delta: -0.5 }], reason: "c" });
    expect(isError(result) && result.error.code).toBe("invalid_change");
  });

  it("accepts the input as a JSON string too", async () => {
    const { getWeights } = setup();
    expect(isError(await getWeights(JSON.stringify({ profileId: PROFILE_ID })))).toBe(false);
  });
});

describe("ranked_picks", () => {
  const setup = () => {
    const world = createTasteWorld();
    const runtime = {
      tmdb: world.tmdb,
      catalog: world.catalog,
      profiles: createMemoryProfileStore(),
      signals: createMemorySignalStore(),
      pools: createMemoryPoolStore(),
      weights: createMemoryWeightStore(),
      config: createMemoryConfigStore(),
    };
    return { runtime, rankedPicks: createRankedPicksTool(() => runtime, () => NOW) };
  };

  it("returns the algorithm's best titles, without seen ones, and saves no pool", async () => {
    const { runtime, rankedPicks } = setup();
    const likes = [5, 10, 15].map((id) => signal("like", id));
    await runtime.signals.putNew(PROFILE_ID, likes);
    const { titles } = RankedPicksOutput.parse(await rankedPicks({ profileId: PROFILE_ID, count: 3 }));
    expect(titles).toHaveLength(3);
    expect(titles.some((t) => [5, 10, 15].includes(t.tmdbId) && t.type === "movie")).toBe(false);
    expect(runtime.pools.saved).toHaveLength(0);
  });

  it("caps count at maxRankedPicks", async () => {
    const { rankedPicks } = setup();
    const { titles } = RankedPicksOutput.parse(await rankedPicks({ profileId: PROFILE_ID, count: 30 }));
    expect(titles).toHaveLength(limits.maxRankedPicks);
  });
});

describe("FR-5: 'I'm tired of action' lowers action in the next pool", () => {
  it("one update_weights call moves the next pool away from the genre", async () => {
    // Likes mostly action (id % 5 = 0), some comedy (id % 5 = 2).
    const likes = [...[5, 10, 15, 20, 25, 30].map((id) => signal("like", id)), ...[2, 7, 12].map((id) => signal("like", id))];
    const base = {
      profile: DEFAULT_PROFILE,
      signals: likes,
      recentPools: [],
      config: DEFAULT_TASTE_CONFIG,
      size: 20,
      now: NOW,
    };
    const action = (titles: { genres: string[] }[]) =>
      titles.filter((t) => t.genres.some((g) => g === "Action" || g === "Action & Adventure")).length;
    const noLayers = { learned: {}, labels: {}, adjustment: {}, adjustmentUpdatedAt: null };

    const before = await buildTastePool(createTasteWorld(), { ...base, layers: noLayers });
    const limited = limitChange([{ feature: "genre:28", delta: -1 }], {}, limits);
    expect(limited.adjustment).toEqual({ "genre:28": -limits.maxDelta });
    const after = await buildTastePool(createTasteWorld(), {
      ...base,
      layers: { ...noLayers, adjustment: limited.adjustment, adjustmentUpdatedAt: new Date(NOW).toISOString() },
    });

    expect(action(after.titles)).toBeLessThan(action(before.titles) * 0.75);
  });
});
