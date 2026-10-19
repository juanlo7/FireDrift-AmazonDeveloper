import { describe, expect, it } from "vitest";
import { TitleCard, type ProviderOffer } from "@firedrift/domain";
import { createCatalogService } from "../src/catalog/catalogService";
import { isOnMyServices, pickTrailerKey } from "../src/catalog/mapping";
import { createTestTmdb } from "./helpers";

const NETFLIX = 8;
const PRIME = 119;
const APPLE_TV = 2;

describe("toTitleCard", () => {
  it("maps a series to the contract shape", async () => {
    const { tmdb } = createTestTmdb();
    const card = await createCatalogService(tmdb).getTitleCard("series", 70523, "ES", [NETFLIX]);

    expect(TitleCard.parse(card)).toEqual(card);
    expect(card).toMatchObject({
      tmdbId: 70523,
      type: "series",
      name: "Dark",
      year: 2017,
      rating: 8.4,
      runtimeMinutes: 55,
      trailerKey: "rrwycJ08PSA",
      posterUrl: "https://image.tmdb.org/t/p/w500/apbrbWs8M9lyOpJYU5WXrpFbk1Z.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/4gD6nViEU3hZgpXTZbG0cS2Ud8Y.jpg",
      genres: ["Crime", "Drama", "Mystery", "Sci-Fi & Fantasy"],
      onMyServices: true,
    });
    expect(card.providers).toEqual([
      {
        providerId: NETFLIX,
        name: "Netflix",
        logoUrl: "https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg",
        offer: "subscription",
      },
    ]);
  });

  it("maps a movie, keeps rent and buy, drops providers without a logo", async () => {
    const { tmdb } = createTestTmdb();
    const card = await createCatalogService(tmdb).getTitleCard("movie", 27205, "ES", []);

    expect(TitleCard.parse(card)).toEqual(card);
    expect(card).toMatchObject({ name: "Inception", year: 2010, runtimeMinutes: 148 });
    expect(card.providers.find((p) => p.providerId === 1899)?.name).toBe("Max");
    expect(card.providers.map((p) => [p.providerId, p.offer])).toEqual([
      [PRIME, "subscription"],
      [1899, "subscription"],
      [APPLE_TV, "rent"],
      [APPLE_TV, "buy"],
    ]);
  });

  it("puts my services first", async () => {
    const { tmdb } = createTestTmdb();
    const card = await createCatalogService(tmdb).getTitleCard("movie", 27205, "ES", [1899]);
    expect(card.providers[0]?.providerId).toBe(1899);
  });

  it("gives no providers for a country TMDB has no data for", async () => {
    const { tmdb } = createTestTmdb();
    const card = await createCatalogService(tmdb).getTitleCard("series", 70523, "JP", []);
    expect(card.providers).toEqual([]);
    expect(card.onMyServices).toBe(false);
  });
});

describe("isOnMyServices (domain.md, Provider and availability)", () => {
  const offer = (providerId: number, kind: ProviderOffer["offer"]): ProviderOffer => ({
    providerId,
    name: String(providerId),
    logoUrl: "https://image.tmdb.org/t/p/w92/x.jpg",
    offer: kind,
  });

  it.each(["subscription", "free", "ads"] as const)("counts %s on one of my services", (kind) => {
    expect(isOnMyServices([offer(NETFLIX, kind)], [NETFLIX])).toBe(true);
  });

  it.each(["rent", "buy"] as const)("does not count %s", (kind) => {
    expect(isOnMyServices([offer(NETFLIX, kind)], [NETFLIX])).toBe(false);
  });

  it("does not count a service I do not have", () => {
    expect(isOnMyServices([offer(PRIME, "subscription")], [NETFLIX])).toBe(false);
  });

  it("treats an empty services list as all services", () => {
    expect(isOnMyServices([offer(PRIME, "subscription")], [])).toBe(true);
  });
});

describe("pickTrailerKey", () => {
  it("prefers the official YouTube trailer over fan trailers, teasers and other sites", () => {
    expect(
      pickTrailerKey([
        { key: "teaser", site: "YouTube", type: "Teaser", official: true },
        { key: "fan", site: "YouTube", type: "Trailer", official: false },
        { key: "official", site: "YouTube", type: "Trailer", official: true },
        { key: "vimeo", site: "Vimeo", type: "Trailer", official: true },
      ]),
    ).toBe("official");
  });

  it("falls back to a teaser, then to null", () => {
    expect(pickTrailerKey([{ key: "t", site: "YouTube", type: "Teaser" }])).toBe("t");
    expect(pickTrailerKey([{ key: "c", site: "YouTube", type: "Clip" }])).toBeNull();
  });
});
