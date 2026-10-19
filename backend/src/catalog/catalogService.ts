import type { ProvidersResponse, TitleCard, TitleType } from "@firedrift/domain";
import { mergeProviderLists, toTitleCard, toTmdbType } from "./mapping";
import type { TmdbClient } from "./tmdbClient";

/** Catalog reads used by the REST routes, the grounding tools (#40) and the pools. */
export interface CatalogService {
  getTitleCard(
    type: TitleType,
    tmdbId: number,
    country: string,
    services: number[],
  ): Promise<TitleCard>;
  listProviders(country: string): Promise<ProvidersResponse>;
}

export const createCatalogService = (tmdb: TmdbClient): CatalogService => ({
  async getTitleCard(type, tmdbId, country, services) {
    const details = await tmdb.details(toTmdbType(type), tmdbId);
    return toTitleCard(type, details, country, services);
  },
  async listProviders(country) {
    const [movie, tv] = await Promise.all([
      tmdb.providerList("movie", country),
      tmdb.providerList("tv", country),
    ]);
    return { providers: mergeProviderLists(country, movie, tv) };
  },
});
