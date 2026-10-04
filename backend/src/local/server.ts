/**
 * Local API for development before the CDK stack (#43) exists.
 *
 * - Catalog routes run the real Lambda handlers against TMDB, with an
 *   in-memory cache instead of DynamoDB.
 * - Profiles live in memory.
 * - Routes owned by P2 (pool, signals, weights) answer with the fixtures in
 *   `packages/domain/fixtures/rest/` until their Lambdas exist.
 *
 * Run: `yarn workspace @firedrift/backend dev` (reads `backend/.env.local`).
 */
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ProfilePutBody, SignalsBody } from "@firedrift/domain";
import { createMemoryCache } from "../catalog/cache";
import { createCatalogService } from "../catalog/catalogService";
import { createTmdbClient, parseTmdbSecret } from "../catalog/tmdbClient";
import { createGetProvidersHandler } from "../handlers/getProviders";
import { createGetTitleHandler } from "../handlers/getTitle";
import type { ProfileServices, ProfileStore } from "../profile/profileStore";
import { error, json, type HttpResult } from "../shared/http";

const secret = process.env.TMDB_TOKEN ?? process.env.TMDB_API_KEY;
if (!secret) {
  console.error("Set TMDB_TOKEN (or TMDB_API_KEY) in backend/.env.local");
  process.exit(1);
}
const port = Number(process.env.PORT ?? 8787);

const tmdb = createTmdbClient({
  credentials: async () => parseTmdbSecret(secret),
  cache: createMemoryCache(2000),
});
const catalog = createCatalogService(tmdb);

const profilesById = new Map<string, ProfileServices>();
const profiles: ProfileStore = { getServices: async (id) => profilesById.get(id) ?? null };

const deps = () => ({ catalog, profiles });
const getTitle = createGetTitleHandler(deps);
const getProviders = createGetProvidersHandler(deps);

const fixturesDir = join(
  dirname(createRequire(import.meta.url).resolve("@firedrift/domain/package.json")),
  "fixtures",
  "rest",
);
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8"));

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
};

const toEvent = (
  pathParameters: Record<string, string>,
  query: URLSearchParams,
): APIGatewayProxyEventV2 =>
  ({ pathParameters, queryStringParameters: Object.fromEntries(query) }) as APIGatewayProxyEventV2;

const route = async (req: IncomingMessage, url: URL): Promise<HttpResult> => {
  const method = req.method ?? "GET";
  const path = url.pathname;
  let match: RegExpMatchArray | null;

  if (method === "GET" && path === "/health") return json(200, { ok: true });
  if (method === "GET" && path === "/providers") {
    return getProviders(toEvent({}, url.searchParams));
  }
  if (method === "GET" && (match = path.match(/^\/titles\/([^/]+)\/([^/]+)$/))) {
    return getTitle(toEvent({ type: match[1]!, tmdbId: match[2]! }, url.searchParams));
  }

  if ((match = path.match(/^\/profiles\/([^/]+)(\/.*)?$/))) {
    const profileId = decodeURIComponent(match[1]!);
    const rest = match[2] ?? "";

    if (method === "PUT" && rest === "") {
      const body = ProfilePutBody.safeParse(await readBody(req));
      if (!body.success) return error(400, "invalid_profile", body.error.message);
      profilesById.set(profileId, {
        services: body.data.services,
        showEverything: body.data.showEverything,
      });
      return { statusCode: 204 };
    }
    // P2 routes: fixtures until the taste Lambdas exist.
    if (method === "GET" && rest === "/pool") return json(200, fixture("pool.response"));
    if (method === "POST" && rest === "/signals") {
      const body = SignalsBody.safeParse(await readBody(req));
      if (!body.success) return error(400, "invalid_signals", body.error.message);
      return json(200, { accepted: body.data.signals.length, duplicates: 0 });
    }
    if (method === "GET" && rest === "/weights") return json(200, fixture("weights.response"));
    if (method === "POST" && (rest === "/weights/undo" || rest === "/weights/reset")) {
      return json(200, fixture("weights.response"));
    }
  }

  return error(404, "not_found", `${method} ${path} is not a route.`);
};

const send = (res: ServerResponse, result: HttpResult) => {
  res.writeHead(result.statusCode ?? 200, result.headers as Record<string, string>);
  res.end(result.body ?? "");
};

createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  let result: HttpResult;
  try {
    result = await route(req, url);
  } catch (cause) {
    console.error(cause);
    result = error(500, "internal_error", "Something went wrong.");
  }
  send(res, result);
  console.info(`${req.method} ${url.pathname}${url.search} → ${result.statusCode} ${Date.now() - started} ms`);
}).listen(port, () => {
  console.info(`FireDrift local API on http://localhost:${port}`);
});
