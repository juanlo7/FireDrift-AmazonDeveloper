import { describe, expect, it, vi } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ApiError, ProvidersResponse, TitleResponse } from "@firedrift/domain";
import { createCatalogService } from "../src/catalog/catalogService";
import { createGetProvidersHandler } from "../src/handlers/getProviders";
import { createGetTitleHandler } from "../src/handlers/getTitle";
import type { ProfileStore } from "../src/profile/profileStore";
import { createTestTmdb } from "./helpers";

const event = (
  pathParameters: Record<string, string> = {},
  queryStringParameters: Record<string, string> = {},
) => ({ pathParameters, queryStringParameters }) as unknown as APIGatewayProxyEventV2;

const body = (result: { body?: string }) => JSON.parse(result.body ?? "null");

const setup = (profile: Awaited<ReturnType<ProfileStore["getServices"]>> = null) => {
  const { tmdb, fetch } = createTestTmdb();
  const profiles: ProfileStore = { getServices: vi.fn(async () => profile) };
  const deps = () => ({ catalog: createCatalogService(tmdb), profiles });
  return {
    fetch,
    profiles,
    getTitle: createGetTitleHandler(deps),
    getProviders: createGetProvidersHandler(deps),
  };
};

describe("GET /titles/{type}/{tmdbId}", () => {
  it("returns a TitleCard that matches the contract", async () => {
    const { getTitle } = setup();
    const result = await getTitle(event({ type: "series", tmdbId: "70523" }, { country: "ES" }));
    expect(result.statusCode).toBe(200);
    expect(TitleResponse.parse(body(result)).name).toBe("Dark");
  });

  it("uses the profile's services for onMyServices", async () => {
    const { getTitle, profiles } = setup({ services: [337], showEverything: false });
    const result = await getTitle(
      event({ type: "series", tmdbId: "70523" }, { country: "ES", profileId: "p-1" }),
    );
    expect(profiles.getServices).toHaveBeenCalledWith("p-1");
    expect(body(result).onMyServices).toBe(false);
  });

  it("ignores the services filter when the profile shows everything", async () => {
    const { getTitle } = setup({ services: [337], showEverything: true });
    const result = await getTitle(
      event({ type: "series", tmdbId: "70523" }, { country: "ES", profileId: "p-1" }),
    );
    expect(body(result).onMyServices).toBe(true);
  });

  it.each([
    [{ type: "film", tmdbId: "1" }, { country: "ES" }, "invalid_type"],
    [{ type: "movie", tmdbId: "abc" }, { country: "ES" }, "invalid_tmdb_id"],
    [{ type: "movie", tmdbId: "0" }, { country: "ES" }, "invalid_tmdb_id"],
    [{ type: "movie", tmdbId: "27205" }, {}, "invalid_country"],
    [{ type: "movie", tmdbId: "27205" }, { country: "ESP" }, "invalid_country"],
  ])("rejects %j %j with %s", async (path, query, code) => {
    const { getTitle, fetch } = setup();
    const result = await getTitle(event(path, query));
    expect(result.statusCode).toBe(400);
    expect(ApiError.parse(body(result)).error.code).toBe(code);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps TMDB 404 to not_found and 5xx to upstream_error", async () => {
    const { getTitle } = setup();
    const missing = await getTitle(event({ type: "movie", tmdbId: "1" }, { country: "ES" }));
    const down = await getTitle(event({ type: "movie", tmdbId: "503" }, { country: "ES" }));
    expect([missing.statusCode, body(missing).error.code]).toEqual([404, "not_found"]);
    expect([down.statusCode, body(down).error.code]).toEqual([502, "upstream_error"]);
  });
});

describe("GET /providers", () => {
  it("merges movie and TV providers in the country's order", async () => {
    const { getProviders } = setup();
    const result = await getProviders(event({}, { country: "es" }));

    expect(result.statusCode).toBe(200);
    const { providers } = ProvidersResponse.parse(body(result));
    expect(providers.map((p) => p.name)).toEqual([
      "Netflix",
      "Amazon Prime Video",
      "Disney Plus",
      "Apple TV",
    ]);
  });

  it("rejects a missing country", async () => {
    const { getProviders } = setup();
    const result = await getProviders(event());
    expect(result.statusCode).toBe(400);
  });
});
