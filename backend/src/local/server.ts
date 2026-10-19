/**
 * Local API for development before the CDK stack (#43) exists.
 *
 * Every route runs its real Lambda handler. TMDB is real, with an in-memory
 * cache; profiles, signals, weights, pools and config live in memory instead of DynamoDB.
 *
 * Run: `yarn workspace @firedrift/backend dev` (reads `backend/.env.local`).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { createMemoryCache } from "../catalog/cache";
import { createCatalogService } from "../catalog/catalogService";
import { createTmdbClient, parseTmdbSecret } from "../catalog/tmdbClient";
import { createGetProvidersHandler } from "../handlers/getProviders";
import { createGetTitleHandler } from "../handlers/getTitle";
import { createGetPoolHandler } from "../handlers/getPool";
import { createPostSignalsHandler } from "../handlers/postSignals";
import { createPutProfileHandler } from "../handlers/putProfile";
import { createWeightsHandler } from "../handlers/weights";
import { createMemoryPoolStore } from "../pool/poolStore";
import { createMemoryProfileStore } from "../profile/profileStore";
import { error, json, type HttpResult } from "../shared/http";
import { createMemorySignalStore } from "../signals/signalStore";
import { createMemoryConfigStore } from "../taste/configStore";
import { createMemoryWeightStore } from "../weights/weightStore";

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

const runtime = {
  tmdb,
  catalog,
  profiles: createMemoryProfileStore(),
  signals: createMemorySignalStore(),
  weights: createMemoryWeightStore(),
  pools: createMemoryPoolStore(),
  config: createMemoryConfigStore(),
};
const deps = () => runtime;

const getTitle = createGetTitleHandler(deps);
const getProviders = createGetProvidersHandler(deps);
const putProfile = createPutProfileHandler(deps);
const postSignals = createPostSignalsHandler(deps);
const getPool = createGetPoolHandler(deps);
const getWeights = createWeightsHandler("summary", deps);
const undoWeights = createWeightsHandler("undo", deps);
const resetWeights = createWeightsHandler("reset", deps);

const readBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};

const toEvent = (
  pathParameters: Record<string, string>,
  query: URLSearchParams,
  body?: string,
): APIGatewayProxyEventV2 =>
  ({
    pathParameters,
    queryStringParameters: Object.fromEntries(query),
    body,
    isBase64Encoded: false,
  }) as APIGatewayProxyEventV2;

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
    const params = { profileId: decodeURIComponent(match[1]!) };
    const rest = match[2] ?? "";
    const event = async () => toEvent(params, url.searchParams, await readBody(req));

    if (method === "PUT" && rest === "") return putProfile(await event());
    if (method === "POST" && rest === "/signals") return postSignals(await event());
    if (method === "GET" && rest === "/pool") return getPool(await event());
    if (method === "GET" && rest === "/weights") return getWeights(await event());
    if (method === "POST" && rest === "/weights/undo") return undoWeights(await event());
    if (method === "POST" && rest === "/weights/reset") return resetWeights(await event());
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
