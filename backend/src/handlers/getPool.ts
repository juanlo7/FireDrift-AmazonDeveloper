import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { PoolResponse } from "@firedrift/domain";
import type { CatalogService } from "../catalog/catalogService";
import type { TmdbClient } from "../catalog/tmdbClient";
import { buildColdStartPool, COLD_START_VERSION, seenKey } from "../pool/coldStart";
import type { PoolStore } from "../pool/poolStore";
import { DEFAULT_PROFILE, type ProfileRepository } from "../profile/profileStore";
import type { SignalStore } from "../signals/signalStore";
import { error, fromError, json, type HttpResult } from "../shared/http";
import { requireProfileId } from "../shared/request";
import { getProfileRuntime } from "../shared/runtime";

export const DEFAULT_POOL_SIZE = 20;
export const MAX_POOL_SIZE = 40;

interface PoolDeps {
  tmdb: TmdbClient;
  catalog: CatalogService;
  profiles: ProfileRepository;
  signals: SignalStore;
  pools: PoolStore;
}

/** `GET /profiles/{profileId}/pool?size=20` → `{ poolId, algorithmVersion, titles }`. */
export const createGetPoolHandler =
  (deps: () => PoolDeps) =>
  async (event: APIGatewayProxyEventV2): Promise<HttpResult> => {
    const profileId = requireProfileId(event);
    if (!profileId.ok) return profileId.response;

    const rawSize = event.queryStringParameters?.size ?? String(DEFAULT_POOL_SIZE);
    const size = /^\d+$/.test(rawSize) ? Number(rawSize) : Number.NaN;
    if (!(size >= 1 && size <= MAX_POOL_SIZE)) {
      return error(400, "invalid_size", `size must be an integer from 1 to ${MAX_POOL_SIZE}.`);
    }

    try {
      const { tmdb, catalog, profiles, signals, pools } = deps();
      const [profile, history] = await Promise.all([
        profiles.get(profileId.value),
        signals.listForProfile(profileId.value),
      ]);
      const titles = await buildColdStartPool(
        { tmdb, catalog },
        {
          profile: profile ?? DEFAULT_PROFILE,
          seen: new Set(history.map((signal) => seenKey(signal.type, signal.tmdbId))),
          size,
        },
      );
      const pool: PoolResponse = { poolId: randomUUID(), algorithmVersion: COLD_START_VERSION, titles };
      await pools.save(profileId.value, pool);
      return json(200, pool);
    } catch (cause) {
      return fromError(cause);
    }
  };

export const handler = createGetPoolHandler(getProfileRuntime);
