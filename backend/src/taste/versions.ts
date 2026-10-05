import { buildColdStartPool, COLD_START_VERSION, seenKey } from "../pool/coldStart";
import { buildTastePool, TASTE_VERSION, type TastePoolDeps, type TastePoolInput, type TastePoolResult } from "./buildPool";

export type PoolBuilder = (deps: TastePoolDeps, input: TastePoolInput) => Promise<TastePoolResult>;

const coldStartOnly: PoolBuilder = async (deps, { profile, signals, recentPools, size }) => ({
  algorithmVersion: COLD_START_VERSION,
  titles: await buildColdStartPool(deps, {
    profile,
    seen: new Set([
      ...signals.map((s) => seenKey(s.type, s.tmdbId)),
      ...recentPools.flatMap((p) => p.titles.map((t) => seenKey(t.type, t.tmdbId))),
    ]),
    size,
  }),
  learned: { weights: {}, labels: {} },
});

/** Every pool algorithm by version. `CONFIG / ACTIVE` picks one without a redeploy. */
export const POOL_BUILDERS: Record<string, PoolBuilder> = {
  [TASTE_VERSION]: buildTastePool,
  [COLD_START_VERSION]: coldStartOnly,
};

/** The builder for a version; an unknown version falls back to the current algorithm. */
export const poolBuilderFor = (version: string): PoolBuilder => POOL_BUILDERS[version] ?? buildTastePool;
