import { RankedPicksInput, type RankedPicksOutput } from "@firedrift/domain";
import type { CatalogService } from "../../catalog/catalogService";
import type { TmdbClient } from "../../catalog/tmdbClient";
import type { PoolStore } from "../../pool/poolStore";
import { DEFAULT_PROFILE, type ProfileRepository } from "../../profile/profileStore";
import type { SignalStore } from "../../signals/signalStore";
import { getProfileRuntime } from "../../shared/runtime";
import { createToolHandler } from "../../shared/tool";
import type { ConfigStore } from "../../taste/configStore";
import { poolBuilderFor } from "../../taste/versions";
import type { WeightStore } from "../../weights/weightStore";

interface RankedPicksDeps {
  tmdb: TmdbClient;
  catalog: CatalogService;
  profiles: ProfileRepository;
  signals: SignalStore;
  pools: PoolStore;
  weights: WeightStore;
  config: ConfigStore;
}

/**
 * `ranked_picks` → `{ titles }`: the taste algorithm's best matches for the
 * butler (no discovery share). Leaves out what the feed and the butler already showed
 * (`exclude`), and saves nothing.
 */
export const createRankedPicksTool = (deps: () => RankedPicksDeps, now: () => number = Date.now) =>
  createToolHandler<RankedPicksInput, RankedPicksOutput>(RankedPicksInput, async ({ profileId, count, exclude }) => {
    const { tmdb, catalog, profiles, signals, pools, weights, config } = deps();
    const taste = await config.getTasteConfig();
    const [profile, history, recentPools, layers] = await Promise.all([
      profiles.get(profileId),
      signals.listForProfile(profileId),
      pools.listRecent(profileId, taste.cooldownPools),
      weights.getLayers(profileId),
    ]);
    const { titles } = await poolBuilderFor(taste.algorithmVersion)(
      { tmdb, catalog },
      {
        profile: profile ?? DEFAULT_PROFILE,
        signals: history,
        recentPools,
        layers,
        config: { ...taste, quotas: taste.butler.rankedPicksQuotas },
        size: Math.min(count, taste.butler.maxRankedPicks),
        now: now(),
        exclude,
      },
    );
    return { titles };
  });

export const handler = createRankedPicksTool(getProfileRuntime);
