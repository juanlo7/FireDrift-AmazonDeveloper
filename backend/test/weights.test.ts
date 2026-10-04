import { describe, expect, it } from "vitest";
import { WeightsResponse, type WeightChange } from "@firedrift/domain";
import { createWeightsHandler } from "../src/handlers/weights";
import { applyDeltas, effectiveWeights, SUMMARY_TOP_N, toSummary, WEIGHT_RANGE } from "../src/weights/summary";
import { createMemoryWeightStore } from "../src/weights/weightStore";
import { body, event, PROFILE_ID } from "./profileFakes";

const change = (changeId: string, delta: number, at = "2026-10-04T18:00:00Z"): WeightChange => ({
  changeId,
  changes: [{ feature: "genre:28", delta }],
  reason: "More action",
  at,
  undone: false,
});

describe("weight math", () => {
  it("clamps learned + adjustment to the range", () => {
    expect(effectiveWeights({ "genre:28": 0.8 }, { "genre:28": 0.5 })).toEqual({ "genre:28": WEIGHT_RANGE });
    expect(effectiveWeights({ "genre:18": -0.9 }, { "genre:18": -0.9 })).toEqual({ "genre:18": -WEIGHT_RANGE });
  });

  it("drops features that end at zero", () => {
    expect(effectiveWeights({ "genre:28": 0.3 }, { "genre:28": -0.3 })).toEqual({});
    expect(applyDeltas({ "genre:28": 0.2 }, [{ feature: "genre:28", delta: 0.2 }], -1)).toEqual({});
  });

  it("keeps the top N likes and dislikes in order", () => {
    const weights = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`genre:${i}`, (i - 4) / 10] as const),
    );
    const summary = toSummary(weights, null);
    expect(summary.likes.map((e) => e.weight)).toEqual([0.3, 0.2, 0.1]);
    expect(summary.dislikes.map((e) => e.weight)).toEqual([-0.4, -0.3, -0.2, -0.1]);
    expect(summary.likes.length).toBeLessThanOrEqual(SUMMARY_TOP_N);
    expect(WeightsResponse.parse(summary).likes[0]?.label).toBe("genre:7");
  });
});

describe("weights routes", () => {
  const setup = async () => {
    const store = createMemoryWeightStore({ [PROFILE_ID]: { learned: { "genre:18": 0.4 } } });
    await store.addChange(PROFILE_ID, change("c1", 0.3, "2026-10-04T18:00:00Z"), { "genre:28": 0.3 });
    await store.addChange(PROFILE_ID, change("c2", 0.2, "2026-10-04T18:05:00Z"), { "genre:28": 0.5 });
    const deps = () => ({ weights: store });
    return {
      store,
      get: createWeightsHandler("summary", deps),
      undo: createWeightsHandler("undo", deps),
      reset: createWeightsHandler("reset", deps),
    };
  };
  const summaryOf = async (result: Promise<{ body?: string }>) => WeightsResponse.parse(body(await result));

  it("returns effective weights and the last change", async () => {
    const { get } = await setup();
    const summary = await summaryOf(get(event()));
    expect(summary.likes).toEqual([
      { feature: "genre:28", label: "genre:28", weight: 0.5 },
      { feature: "genre:18", label: "genre:18", weight: 0.4 },
    ]);
    expect(summary.lastChange?.changeId).toBe("c2");
  });

  it("undo reverts the newest change, then the next one, then nothing", async () => {
    const { undo } = await setup();
    const first = await summaryOf(undo(event()));
    expect(first.likes.find((e) => e.feature === "genre:28")?.weight).toBeCloseTo(0.3);
    expect(first.lastChange).toMatchObject({ changeId: "c2", undone: true });

    const second = await summaryOf(undo(event()));
    expect(second.likes.map((e) => e.feature)).toEqual(["genre:18"]);

    const third = await summaryOf(undo(event()));
    expect(third).toEqual(second);
  });

  it("reset clears the adjustment layer and undo cannot replay old changes", async () => {
    const { reset, undo } = await setup();
    const afterReset = await summaryOf(reset(event()));
    expect(afterReset.likes).toEqual([{ feature: "genre:18", label: "genre:18", weight: 0.4 }]);
    expect(await summaryOf(undo(event()))).toEqual(afterReset);
  });

  it("returns an empty summary for a new profile", async () => {
    const { get } = await setup();
    const summary = await summaryOf(get(event({ profileId: "6b1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" })));
    expect(summary).toEqual({ likes: [], dislikes: [], lastChange: null });
  });

  it("rejects a bad profileId", async () => {
    const { get } = await setup();
    expect((await get(event({ profileId: "nope" }))).statusCode).toBe(400);
  });
});
