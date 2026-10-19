import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { TitleCard, TitleType } from "@firedrift/domain";
import { vi } from "vitest";
import type { CatalogService } from "../src/catalog/catalogService";
import type { TmdbClient } from "../src/catalog/tmdbClient";
import type { TmdbListItem, TmdbPage } from "../src/catalog/tmdbTypes";

export const PROFILE_ID = "3f6c2a7e-8b1d-4c5e-9a2f-1d7e6b4c8a90";

/** A JSON file from `packages/domain/fixtures/`. */
export const domainFixture = (path: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, "../../packages/domain/fixtures", path), "utf8"));

export const event = (
  pathParameters: Record<string, string> = { profileId: PROFILE_ID },
  options: { body?: unknown; query?: Record<string, string>; base64?: boolean } = {},
) => {
  const text = options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  return {
    pathParameters,
    queryStringParameters: options.query,
    body: options.base64 && text ? Buffer.from(text).toString("base64") : text,
    isBase64Encoded: options.base64 ?? false,
  } as unknown as APIGatewayProxyEventV2;
};

export const body = (result: { body?: string }) => JSON.parse(result.body ?? "null");

const listItem = (id: number, genre: number): TmdbListItem => ({
  id,
  overview: "",
  popularity: 100 - id,
  vote_average: 7,
  vote_count: 1000,
  genre_ids: [genre],
  poster_path: null,
  backdrop_path: null,
});

/**
 * Discover pages: movies 1–40 and series 101–140, with genres cycling over 4
 * values, so variety and alternation are visible.
 */
export const createFakeTmdb = () => {
  const discover = vi.fn(async (type: "movie" | "tv", params: Record<string, unknown>) => {
    const page = Number(params.page ?? 1);
    const base = (type === "movie" ? 0 : 100) + (page - 1) * 20;
    const results = Array.from({ length: 20 }, (_, i) => listItem(base + i + 1, (base + i) % 4));
    return { page, results, total_pages: 2, total_results: 40 } satisfies TmdbPage<TmdbListItem>;
  });
  return { tmdb: { discover } as unknown as TmdbClient, discover };
};

const template = domainFixture("rest/title.response.json") as TitleCard;

export const createFakeCatalog = (failIds: number[] = []) => {
  const getTitleCard = vi.fn(async (type: TitleType, tmdbId: number, _country: string, _services: number[]) => {
    if (failIds.includes(tmdbId)) throw new Error("TMDB down");
    return { ...template, type, tmdbId };
  });
  return { catalog: { getTitleCard, listProviders: vi.fn() } as unknown as CatalogService, getTitleCard };
};
