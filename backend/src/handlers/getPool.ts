import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { PoolResponse } from "@firedrift/domain";
import type { CatalogService } from "../catalog/catalogService";
import type { TmdbClient } from "../catalog/tmdbClient";
import type { PoolStore } from "../pool/poolStore";
import { DEFAULT_PROFILE, type ProfileRepository } from "../profile/profileStore";
import type { SignalStore } from "../signals/signalStore";
import { error, fromError, json, type HttpResult } from "../shared/http";
import { requireProfileId } from "../shared/request";
import { getProfileRuntime } from "../shared/runtime";
import type { ConfigStore } from "../taste/configStore";
import { poolBuilderFor } from "../taste/versions";
import type { WeightStore } from "../weights/weightStore";

export const DEFAULT_POOL_SIZE = 20;
export const MAX_POOL_SIZE = 40;

interface PoolDeps {
  tmdb: TmdbClient;
  catalog: CatalogService;
  profiles: ProfileRepository;
  signals: SignalStore;
  pools: PoolStore;
  weights: WeightStore;
  config: ConfigStore;
}

/** `GET /profiles/{profileId}/pool?size=20` → `{ poolId, algorithmVersion, titles }`. */
export const createGetPoolHandler =
  (deps: () => PoolDeps, now: () => number = Date.now) =>
  async (event: APIGatewayProxyEventV2): Promise<HttpResult> => {
    const profileId = requireProfileId(event);
    if (!profileId.ok) return profileId.response;

    const rawSize = event.queryStringParameters?.size ?? String(DEFAULT_POOL_SIZE);
    const size = /^\d+$/.test(rawSize) ? Number(rawSize) : Number.NaN;
    if (!(size >= 1 && size <= MAX_POOL_SIZE)) {
      return error(400, "invalid_size", `size must be an integer from 1 to ${MAX_POOL_SIZE}.`);
    }

    try {
      const { tmdb, catalog, profiles, signals, pools, weights, config } = deps();
      const taste = await config.getTasteConfig();
      const [profile, history, recentPools, layers] = await Promise.all([
        profiles.get(profileId.value),
        signals.listForProfile(profileId.value),
        pools.listRecent(profileId.value, taste.cooldownPools),
        weights.getLayers(profileId.value),
      ]);
      const result = await poolBuilderFor(taste.algorithmVersion)(
        { tmdb, catalog },
        { profile: profile ?? DEFAULT_PROFILE, signals: history, recentPools, layers, config: taste, size, now: now() },
      );
      const pool: PoolResponse = {
        poolId: randomUUID(),
        algorithmVersion: result.algorithmVersion,
        titles: result.titles,
      };
      await Promise.all([
        pools.save(profileId.value, pool),
        weights.saveLearned(profileId.value, result.learned.weights, result.learned.labels),
      ]);
      return json(200, pool);
    } catch (cause) {
      return fromError(cause);
    }
  };

export const handler = createGetPoolHandler(getProfileRuntime);
