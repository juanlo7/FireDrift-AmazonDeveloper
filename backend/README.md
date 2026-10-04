# FireDrift backend

Lambdas in TypeScript for the HTTP API (`docs/contracts.md`, section 2) and the
agent tools. The CDK stack that deploys them is #43.

```sh
yarn workspace @firedrift/backend typecheck
yarn workspace @firedrift/backend test
```

## Local API (before the AWS stack exists)

Runs the real catalog handlers against TMDB on your machine. Profiles live in
memory; P2's routes (pool, signals, weights) answer with the fixtures in
`packages/domain/fixtures/rest/` until their Lambdas exist.

1. Get a free TMDB key (themoviedb.org → Settings → API) and save the API Read
   Access Token in `backend/.env.local` (git ignores it):
   ```sh
   echo 'TMDB_TOKEN=eyJ...' > backend/.env.local
   ```
2. Start the API on `http://localhost:8787`:
   ```sh
   yarn workspace @firedrift/backend dev
   ```
3. To use it from the app on the VVD, forward the port to the device and switch
   `app/src/config.ts` to `apiMode: 'real'`, `apiBaseUrl: 'http://localhost:8787'`
   (do not commit that change):
   ```sh
   vega device start-port-forwarding -p 8787 --forward false
   ```

## Catalog (TMDB)

| Route | Handler |
|---|---|
| `GET /providers?country=ES` | `src/handlers/getProviders.ts` → `handler` |
| `GET /titles/{type}/{tmdbId}?country=ES&profileId=…` | `src/handlers/getTitle.ts` → `handler` |

- `src/catalog/tmdbClient.ts`: the only TMDB client (search, details, videos,
  watch providers, provider list, discover, recommendations, similar). Details
  come with videos and watch providers in one request
  (`append_to_response=videos,watch/providers`). Names in `en-US`.
- `src/catalog/mapping.ts`: TMDB → `TitleCard`. Official YouTube trailer first;
  `flatrate` is `subscription`; `onMyServices` follows the availability rule
  (subscription, free or ads on one of my services; no services = all).
- `src/catalog/catalogService.ts`: what routes, grounding tools (#40) and pools
  call. Build it with `createCatalogService(tmdb)`.

### Cache

Every TMDB response is cached twice: in memory per Lambda instance, and in
DynamoDB with a TTL (details 24 h, search and lists 24 h, discover 6 h,
provider lists 7 days). Errors are never cached.

## AWS stack (CDK)

`backend/infra/` deploys one stack, `FireDrift-dev`, in `us-east-1`. The whole
team shares it; test branches with the local API above before you merge.

| Resource | Notes |
|---|---|
| DynamoDB table | On demand. Partition key `pk`, sort key `sk`, TTL attribute `ttl` (string keys) |
| Secrets Manager secret | `firedrift/dev/tmdb`: the TMDB API Read Access Token or a v3 API key, put by hand |
| HTTP API | Stage `$default`, throttled to 20 requests/s (burst 40) unless a route sets its own limit |
| Lambdas | `BackendFunction`: Node.js 22, ARM, 256 MB, 10 s, logs kept 7 days, bundled with esbuild |

Every resource gets the tags `project=firedrift` and `env=dev`. The AWS Budgets
alerts ($30, $75, $110 actual, $130 forecast) were created by hand with the
account and are not part of the stack.

### Deploy

Needs an IAM user of the `firedrift` AWS account; ask P2 for one.

```sh
aws login --profile firedrift
cd backend/infra
yarn cdk diff --profile firedrift
yarn cdk deploy --profile firedrift
```

The outputs print `ApiUrl`, `TableName` and `TmdbSecretName`. After the first
deploy, put the TMDB token in the secret (the value is read from the terminal
and never shown):

```sh
read -rs TOKEN && aws secretsmanager put-secret-value --profile firedrift \
  --secret-id firedrift/dev/tmdb --secret-string "$TOKEN"; unset TOKEN
```

A `prod` stack for judging is the same code: `yarn cdk deploy -c env=prod`.

### Add your routes

Each owner keeps their routes in their own construct in `backend/infra/lib/`,
created from `FireDriftStack`:

- `catalog-construct.ts` (P1): `GET /providers`, `GET /titles/{type}/{tmdbId}`.

A construct gets a `BackendContext` (`table`, `tmdbSecret`, `addRoute`). Create
each Lambda with `new BackendFunction(this, id, { handler: "<file in
src/handlers>" })`, give it only the IAM actions it uses, and call
`ctx.addRoute({ method, path, handler, throttle? })`. Run
`yarn workspace @firedrift/infra test` to check the cost rules.

### Table design

One table for everything. Profile items share the partition `PROFILE#<profileId>`.

| Item | `pk` | `sk` | Attributes | TTL | Writer |
|---|---|---|---|---|---|
| TMDB cache | `TMDB#<path?query>` | `CACHE` | `body` (JSON string) | 6 h – 7 days | catalog (#39) |
| Device profile | `PROFILE#<profileId>` | `PROFILE` | `country`, `services` (number list), `showEverything`, `updatedAt` | — | `PUT /profiles` (#44) |
| Signal | `PROFILE#<profileId>` | `SIGNAL#<signalId>` | the `Signal` fields; put only if new (idempotent) | 30 days | `POST /signals` (#44) |
| Learned weights | `PROFILE#<profileId>` | `WEIGHTS#LEARNED` | `weights` (feature → number), `updatedAt` | — | taste (#46) |
| Butler adjustment | `PROFILE#<profileId>` | `WEIGHTS#ADJUST` | `weights`, `updatedAt` (decays on read) | — | `update_weights` (#47) |
| Weight change | `PROFILE#<profileId>` | `CHANGE#<at>#<changeId>` | the `WeightChange` fields; last 20 kept | — | `update_weights` (#47) |
| Pool | `PROFILE#<profileId>` | `POOL#<poolId>` | `algorithmVersion`, `titles` | 7 days | pool (#44, #46) |
| Seen title | `PROFILE#<profileId>` | `SEEN#<type>#<tmdbId>` | `lastSeenAt` (recency cooldown) | 30 days | pool (#46) |
| Config | `CONFIG` | `ACTIVE` | `algorithmVersion`, quotas, signal strengths, butler caps, kill switch, model ID | — | by hand; code has defaults (#46) |

The rows after the device profile are the plan for #44, #46 and #47; those PRs
may refine them and update this table.
