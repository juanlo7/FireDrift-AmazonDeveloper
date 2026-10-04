import type { Offer, Provider, ProviderOffer, TitleCard, TitleType } from "@firedrift/domain";
import type {
  TmdbCountryProviders,
  TmdbDetails,
  TmdbMediaType,
  TmdbMovieDetails,
  TmdbProviderListItem,
  TmdbTvDetails,
  TmdbVideo,
} from "./tmdbTypes";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export const toTmdbType = (type: TitleType): TmdbMediaType => (type === "movie" ? "movie" : "tv");

export const imageUrl = (path: string | null | undefined, size: "w92" | "w500" | "w1280") =>
  path ? `${IMAGE_BASE_URL}/${size}${path}` : null;

const yearOf = (date: string | undefined): number | null => {
  const year = date ? Number.parseInt(date.slice(0, 4), 10) : Number.NaN;
  return Number.isFinite(year) ? year : null;
};

const isMovie = (details: TmdbDetails): details is TmdbMovieDetails => "title" in details;

const positiveOrNull = (minutes: number | null | undefined) =>
  typeof minutes === "number" && minutes > 0 ? Math.round(minutes) : null;

/**
 * The official YouTube trailer: official trailers first, then any trailer,
 * then a teaser; the newest wins inside each group.
 */
export const pickTrailerKey = (videos: TmdbVideo[]): string | null => {
  const youtube = videos.filter((v) => v.site === "YouTube" && v.key);
  const newestFirst = (list: TmdbVideo[]) =>
    [...list].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  const groups = [
    youtube.filter((v) => v.type === "Trailer" && v.official),
    youtube.filter((v) => v.type === "Trailer"),
    youtube.filter((v) => v.type === "Teaser"),
  ];
  for (const group of groups) {
    const first = newestFirst(group)[0];
    if (first) return first.key;
  }
  return null;
};

/** TMDB offer lists in the order we show them. `flatrate` is a subscription. */
const OFFER_KEYS: [keyof TmdbCountryProviders, Offer][] = [
  ["flatrate", "subscription"],
  ["free", "free"],
  ["ads", "ads"],
  ["rent", "rent"],
  ["buy", "buy"],
];

export const toProviderOffers = (country: TmdbCountryProviders): ProviderOffer[] =>
  OFFER_KEYS.flatMap(([key, offer]) => {
    const list = country[key];
    if (!Array.isArray(list)) return [];
    return [...list]
      .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
      .flatMap((p) => {
        const logoUrl = imageUrl(p.logo_path, "w92");
        return logoUrl
          ? [{ providerId: p.provider_id, name: p.provider_name.trim(), logoUrl, offer }]
          : [];
      });
  });

/** Offers that count for "on my services" (domain.md, Provider and availability). */
const WATCHABLE_OFFERS: ReadonlySet<Offer> = new Set(["subscription", "free", "ads"]);

/**
 * At least one of the user's providers offers the title as subscription, free
 * or ads. An empty `services` list means all services.
 */
export const isOnMyServices = (providers: ProviderOffer[], services: number[]): boolean =>
  providers.some(
    (p) =>
      WATCHABLE_OFFERS.has(p.offer) && (services.length === 0 || services.includes(p.providerId)),
  );

/** My services first, then the rest; the TMDB order is kept inside each group. */
export const sortMyServicesFirst = (providers: ProviderOffer[], services: number[]) =>
  services.length === 0
    ? providers
    : [
        ...providers.filter((p) => services.includes(p.providerId)),
        ...providers.filter((p) => !services.includes(p.providerId)),
      ];

export const toTitleCard = (
  type: TitleType,
  details: TmdbDetails,
  country: string,
  services: number[],
): TitleCard => {
  const countryProviders = details["watch/providers"]?.results[country] ?? {};
  const providers = sortMyServicesFirst(toProviderOffers(countryProviders), services);
  const tv = details as TmdbTvDetails;

  return {
    tmdbId: details.id,
    type,
    name: isMovie(details) ? details.title : tv.name,
    year: yearOf(isMovie(details) ? details.release_date : tv.first_air_date),
    overview: details.overview ?? "",
    rating:
      details.vote_count > 0
        ? Math.min(10, Math.max(0, Math.round(details.vote_average * 10) / 10))
        : null,
    genres: details.genres.map((g) => g.name),
    runtimeMinutes: isMovie(details)
      ? positiveOrNull(details.runtime)
      : positiveOrNull(tv.episode_run_time?.[0] ?? tv.last_episode_to_air?.runtime),
    posterUrl: imageUrl(details.poster_path, "w500"),
    backdropUrl: imageUrl(details.backdrop_path, "w1280"),
    trailerKey: pickTrailerKey(details.videos?.results ?? []),
    providers,
    onMyServices: isOnMyServices(providers, services),
  };
};

/**
 * Movie and TV provider lists merged by `providerId`, in the country's display
 * order. Providers without a logo are left out (the contract needs a URL).
 */
export const mergeProviderLists = (
  country: string,
  ...lists: TmdbProviderListItem[][]
): Provider[] => {
  const byId = new Map<number, { provider: Provider; priority: number }>();
  for (const item of lists.flat()) {
    const logoUrl = imageUrl(item.logo_path, "w92");
    if (!logoUrl) continue;
    const priority = item.display_priorities?.[country] ?? item.display_priority ?? 999;
    const known = byId.get(item.provider_id);
    if (!known || priority < known.priority) {
      byId.set(item.provider_id, {
        provider: { providerId: item.provider_id, name: item.provider_name.trim(), logoUrl },
        priority,
      });
    }
  }
  return [...byId.values()]
    .sort((a, b) => a.priority - b.priority || a.provider.name.localeCompare(b.provider.name))
    .map((entry) => entry.provider);
};
