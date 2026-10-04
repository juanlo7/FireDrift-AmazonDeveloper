import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { TitleType } from "@firedrift/domain";
import type { CatalogService } from "../catalog/catalogService";
import type { ProfileStore } from "../profile/profileStore";
import { COUNTRY_PATTERN, error, fromError, json, type HttpResult } from "../shared/http";
import { getCatalogRuntime } from "../shared/runtime";

/**
 * `GET /titles/{type}/{tmdbId}?country=ES&profileId=…` → `TitleCard`.
 * `onMyServices` and the provider order use the profile's services; an
 * unknown or missing profile counts as "all services".
 */
export const createGetTitleHandler =
  (deps: () => { catalog: CatalogService; profiles: ProfileStore }) =>
  async (event: APIGatewayProxyEventV2): Promise<HttpResult> => {
    const type = TitleType.safeParse(event.pathParameters?.type);
    if (!type.success) return error(400, "invalid_type", "type must be movie or series.");

    const rawId = event.pathParameters?.tmdbId ?? "";
    const tmdbId = /^\d+$/.test(rawId) ? Number(rawId) : Number.NaN;
    if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
      return error(400, "invalid_tmdb_id", "tmdbId must be a positive integer.");
    }

    const country = event.queryStringParameters?.country?.toUpperCase();
    if (!country || !COUNTRY_PATTERN.test(country)) {
      return error(400, "invalid_country", "country must be an ISO 3166-1 alpha-2 code.");
    }

    try {
      const { catalog, profiles } = deps();
      const profileId = event.queryStringParameters?.profileId;
      const profile = profileId ? await profiles.getServices(profileId) : null;
      const services = profile && !profile.showEverything ? profile.services : [];
      return json(200, await catalog.getTitleCard(type.data, tmdbId, country, services));
    } catch (cause) {
      return fromError(cause);
    }
  };

export const handler = createGetTitleHandler(getCatalogRuntime);
