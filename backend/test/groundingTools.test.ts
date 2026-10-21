import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ResolveTitlesOutput,
  SimilarOutput,
  type ApiError,
  type Proposal,
  type TitleCard,
  type TitleType,
} from "@firedrift/domain";
import type { CatalogService } from "../src/catalog/catalogService";
import { TmdbError, type TmdbClient } from "../src/catalog/tmdbClient";
import type { TmdbListItem, TmdbPage } from "../src/catalog/tmdbTypes";
import { normalizeTitle, pickConfidentMatch } from "../src/grounding/match";
import { createResolveTitlesTool } from "../src/handlers/tools/resolveTitles";
import { createSimilarTool, MAX_SIMILAR, MAX_SIMILAR_LOOKUPS } from "../src/handlers/tools/similar";
import { createMemoryProfileStore } from "../src/profile/profileStore";
import { domainFixture, PROFILE_ID } from "./profileFakes";

const NETFLIX = 8;
const template = domainFixture("rest/title.response.json") as TitleCard;

const isError = (result: unknown): result is ApiError =>
  typeof result === "object" && result !== null && "error" in result;

const item = (id: number, title: string, date: string, voteCount = 100): TmdbListItem => ({
  id,
  title,
  name: title,
  release_date: date,
  first_air_date: date,
  overview: "",
  popularity: 1,
  vote_average: 7,
  vote_count: voteCount,
  genre_ids: [],
  poster_path: null,
  backdrop_path: null,
});

const page = (results: TmdbListItem[]): TmdbPage<TmdbListItem> => ({
  page: 1,
  results,
  total_pages: 1,
  total_results: results.length,
});

/** The TMDB catalog the tests know. Search filters by year like TMDB does. */
const CATALOG: Record<"movie" | "tv", TmdbListItem[]> = {
  tv: [item(90669, "1899", "2022-11-17"), item(70523, "Dark", "2017-12-01")],
  movie: [
    item(329865, "Arrival", "2016-11-10", 18000),
    item(9999, "Arrival", "1996-05-31", 600),
    item(27205, "Inception", "2010-07-15"),
    item(155, "The Dark Knight", "2008-07-16"),
  ],
};

/** Titles on Netflix (the test profile's service). */
const ON_NETFLIX = new Set([90669, 70523, 27205]);

const createFakes = (overrides: Partial<TmdbClient> = {}) => {
  const search = vi.fn(async (type: "movie" | "tv", query: string, year?: number) =>
    page(
      CATALOG[type].filter(
        (i) =>
          normalizeTitle(i.title ?? "").includes(normalizeTitle(query)) &&
          (year === undefined || (i.release_date ?? "").startsWith(String(year))),
      ),
    ),
  );
  const recommendations = vi.fn(async () => page([]));
  const similar = vi.fn(async () => page([]));
  const tmdb = { search, recommendations, similar, ...overrides } as unknown as TmdbClient;

  const getTitleCard = vi.fn(async (type: TitleType, tmdbId: number, _country: string, services: number[]) => {
    if (tmdbId === 404) throw new TmdbError(404, "gone");
    const onMine = ON_NETFLIX.has(tmdbId);
    return {
      ...template,
      type,
      tmdbId,
      name: [...CATALOG.movie, ...CATALOG.tv].find((i) => i.id === tmdbId)?.title ?? `Title ${tmdbId}`,
      onMyServices: services.length === 0 ? true : onMine,
    } satisfies TitleCard;
  });
  const catalog = { getTitleCard, listProviders: vi.fn() } as unknown as CatalogService;

  const profiles = createMemoryProfileStore();
  return { tmdb, catalog, profiles, search, recommendations, similar, getTitleCard };
};

const useNetflixProfile = async (profiles: ReturnType<typeof createMemoryProfileStore>, showEverything = false) =>
  profiles.put(PROFILE_ID, { country: "ES", services: [NETFLIX], showEverything });

describe("pickConfidentMatch", () => {
  const proposal = (title: string, year: number | null, type: Proposal["type"] = "movie"): Proposal => ({
    title,
    year,
    type,
  });

  it("ignores case, accents, punctuation and a leading article", () => {
    expect(normalizeTitle("The Amélie: Story & Co.")).toBe(normalizeTitle("amelie story and co"));
    expect(pickConfidentMatch(proposal("dark knight", 2008), CATALOG.movie)?.id).toBe(155);
  });

  it("never accepts a similar but different title", () => {
    expect(pickConfidentMatch(proposal("Dark", 2008), CATALOG.movie)).toBeNull();
  });

  it("accepts a year off by one but not more", () => {
    expect(pickConfidentMatch(proposal("Inception", 2011), CATALOG.movie)?.id).toBe(27205);
    expect(pickConfidentMatch(proposal("Inception", 2013), CATALOG.movie)).toBeNull();
  });

  it("picks the exact year among namesakes, or the best known without a year", () => {
    expect(pickConfidentMatch(proposal("Arrival", 1996), CATALOG.movie)?.id).toBe(9999);
    expect(pickConfidentMatch(proposal("Arrival", null), CATALOG.movie)?.id).toBe(329865);
  });
});

describe("resolve_titles", () => {
  let logs: string[];
  beforeEach(() => {
    logs = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void logs.push(line));
  });
  afterEach(() => vi.restoreAllMocks());

  const run = async (proposals: unknown[], showEverything = false) => {
    const fakes = createFakes();
    await useNetflixProfile(fakes.profiles, showEverything);
    const tool = createResolveTitlesTool(() => fakes);
    return { result: await tool({ profileId: PROFILE_ID, proposals }), fakes };
  };

  it("answers the contract fixture: resolves 1899, drops the made-up title and the one off my services", async () => {
    const input = domainFixture("tools/resolve-titles.input.json") as { proposals: Proposal[] };
    const expected = domainFixture("tools/resolve-titles.output.json") as ResolveTitlesOutput;
    const { result } = await run(input.proposals);

    const output = ResolveTitlesOutput.parse(result);
    expect(output.resolved.map((t) => [t.type, t.tmdbId])).toEqual(expected.resolved.map((t) => [t.type, t.tmdbId]));
    expect(output.dropped).toEqual(expected.dropped);
  });

  it("never shows a title without a TMDB ID that TMDB returned", async () => {
    const { result, fakes } = await run([
      { title: "Dark", year: 2017, type: "series" },
      { title: "A Film The Model Invented", year: 2020, type: "movie" },
    ]);
    const output = ResolveTitlesOutput.parse(result);
    // If this fails, a title the model made up can reach the screen.
    for (const card of output.resolved) {
      expect(card.tmdbId).toBeGreaterThan(0);
      expect(fakes.getTitleCard).toHaveBeenCalledWith(card.type, card.tmdbId, "ES", [NETFLIX]);
    }
    expect(output.resolved.map((t) => t.name)).toEqual(["Dark"]);
    expect(output.dropped).toEqual([
      { proposal: { title: "A Film The Model Invented", year: 2020, type: "movie" }, reason: "no_match" },
    ]);
  });

  it("searches again without the year when the model got the year wrong", async () => {
    const { result, fakes } = await run([{ title: "1899", year: 2023, type: "series" }]);
    expect(ResolveTitlesOutput.parse(result).resolved.map((t) => t.tmdbId)).toEqual([90669]);
    expect(fakes.search).toHaveBeenCalledTimes(2);
  });

  it("shows titles off my services when show everything is on", async () => {
    const { result } = await run([{ title: "Arrival", year: 2016, type: "movie" }], true);
    expect(ResolveTitlesOutput.parse(result).resolved.map((t) => t.tmdbId)).toEqual([329865]);
  });

  it("shows a title once when two proposals name it", async () => {
    const { result } = await run([
      { title: "Dark", year: 2017, type: "series" },
      { title: "dark", year: null, type: "series" },
    ]);
    expect(ResolveTitlesOutput.parse(result).resolved).toHaveLength(1);
  });

  it("accepts a proposal without a year (the Gateway schema leaves it out)", async () => {
    const { result } = await run([{ title: "Inception", type: "movie" }]);
    expect(ResolveTitlesOutput.parse(result).resolved.map((t) => t.tmdbId)).toEqual([27205]);
  });

  it("rejects more than 5 proposals", async () => {
    const { result } = await run(Array.from({ length: 6 }, () => ({ title: "Dark", year: 2017, type: "series" })));
    expect(isError(result) && result.error.code).toBe("invalid_input");
  });

  it("logs the drop rate of every call", async () => {
    await run([
      { title: "1899", year: 2022, type: "series" },
      { title: "Nope Nope", year: 2001, type: "movie" },
      { title: "Arrival", year: 2016, type: "movie" },
      { title: "Dark", year: 2017, type: "series" },
    ]);
    const line = logs.map((l) => JSON.parse(l)).find((l) => l.metric === "grounding_drop_rate");
    expect(line).toEqual({
      metric: "grounding_drop_rate",
      tool: "resolve_titles",
      proposals: 4,
      resolved: 2,
      droppedNoMatch: 1,
      droppedNotOnMyServices: 1,
      dropRate: 0.5,
    });
  });

  it("returns an error, never throws, when TMDB is down", async () => {
    const fakes = createFakes({
      search: vi.fn(async () => {
        throw new TmdbError(503, "down");
      }),
    });
    const tool = createResolveTitlesTool(() => fakes);
    const result = await tool({ profileId: PROFILE_ID, proposals: [{ title: "Dark", year: 2017, type: "series" }] });
    expect(isError(result) && result.error.code).toBe("upstream_error");
  });
});

describe("similar", () => {
  const ids = (n: number, from: number) => Array.from({ length: n }, (_, i) => item(from + i, `T${from + i}`, "2020-01-01"));

  it("answers the contract fixture with titles on my services, never the seed", async () => {
    const input = domainFixture("tools/similar.input.json") as { type: TitleType; tmdbId: number; count: number };
    const fakes = createFakes({
      recommendations: vi.fn(async () => page([item(70523, "Dark", "2017-12-01"), item(329865, "Arrival", "2016-11-10"), item(90669, "1899", "2022-11-17")])),
    });
    await useNetflixProfile(fakes.profiles);
    const result = await createSimilarTool(() => fakes)({ ...input, profileId: PROFILE_ID });

    const output = SimilarOutput.parse(result);
    expect(output.titles.map((t) => t.tmdbId)).toEqual([90669]);
  });

  it("leaves out the titles the butler already showed", async () => {
    const fakes = createFakes({
      recommendations: vi.fn(async () => page([item(27205, "Inception", "2010-07-15"), item(70523, "Dark", "2017-12-01")])),
    });
    await useNetflixProfile(fakes.profiles);
    const result = await createSimilarTool(() => fakes)({
      profileId: PROFILE_ID,
      type: "movie",
      tmdbId: 1,
      count: 3,
      exclude: [{ type: "movie", tmdbId: 27205 }],
    });
    expect(SimilarOutput.parse(result).titles.map((t) => t.tmdbId)).toEqual([70523]);
  });

  it("fills up from TMDB similar when recommendations are not enough", async () => {
    const fakes = createFakes({
      recommendations: vi.fn(async () => page([item(27205, "Inception", "2010-07-15")])),
      similar: vi.fn(async () => page([item(70523, "Dark", "2017-12-01"), item(90669, "1899", "2022-11-17")])),
    });
    await useNetflixProfile(fakes.profiles);
    const result = await createSimilarTool(() => fakes)({ profileId: PROFILE_ID, type: "movie", tmdbId: 1, count: 3 });
    expect(SimilarOutput.parse(result).titles.map((t) => t.tmdbId)).toEqual([27205, 70523, 90669]);
  });

  it(`returns at most ${MAX_SIMILAR} titles and looks up at most ${MAX_SIMILAR_LOOKUPS}`, async () => {
    const fakes = createFakes({
      recommendations: vi.fn(async () => page(ids(20, 1000))),
      similar: vi.fn(async () => page(ids(20, 2000))),
    });
    // Nothing is on Netflix, so the tool keeps looking until the lookup cap.
    await useNetflixProfile(fakes.profiles);
    const result = await createSimilarTool(() => fakes)({ profileId: PROFILE_ID, type: "movie", tmdbId: 1, count: 50 });
    expect(SimilarOutput.parse(result).titles).toEqual([]);
    expect(fakes.getTitleCard).toHaveBeenCalledTimes(MAX_SIMILAR_LOOKUPS);

    await fakes.profiles.put(PROFILE_ID, { country: "ES", services: [], showEverything: false });
    const all = await createSimilarTool(() => fakes)({ profileId: PROFILE_ID, type: "movie", tmdbId: 1, count: 50 });
    expect(SimilarOutput.parse(all).titles).toHaveLength(MAX_SIMILAR);
  });

  it("skips a title TMDB cannot serve", async () => {
    const fakes = createFakes({
      recommendations: vi.fn(async () => page([item(404, "Gone", "2020-01-01"), item(70523, "Dark", "2017-12-01")])),
    });
    await useNetflixProfile(fakes.profiles);
    const result = await createSimilarTool(() => fakes)({ profileId: PROFILE_ID, type: "series", tmdbId: 1, count: 2 });
    expect(SimilarOutput.parse(result).titles.map((t) => t.tmdbId)).toEqual([70523]);
  });
});
