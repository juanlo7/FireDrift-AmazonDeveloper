# FireDrift backend

Lambdas in TypeScript for the HTTP API (`docs/contracts.md`, section 2) and the
agent tools. The CDK stack that deploys them is #43.

```sh
yarn workspace @firedrift/backend typecheck
yarn workspace @firedrift/backend test
```

## Local API

Runs every real handler on your machine against TMDB. Profiles, signals,
weights and pools live in memory and are lost when it stops.

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

## Profile and taste (P2)

| Route | Handler |
|---|---|
| `PUT /profiles/{profileId}` | `src/handlers/putProfile.ts` |
| `POST /profiles/{profileId}/signals` | `src/handlers/postSignals.ts` |
| `GET /profiles/{profileId}/pool?size=20` | `src/handlers/getPool.ts` |
| `GET /profiles/{profileId}/weights` | `src/handlers/getWeights.ts` |
| `POST /profiles/{profileId}/weights/undo` | `src/handlers/undoWeights.ts` |
| `POST /profiles/{profileId}/weights/reset` | `src/handlers/resetWeights.ts` |

- `profileId` must be a UUID. A profile that was never saved counts as country
  `ES` with all services, so the feed works before `PUT /profiles`.
- Signals are idempotent by `signalId`: a resent batch comes back as `duplicates`.
- `size` goes from 1 to 40. The pool comes from the taste algorithm below; a
  profile with no positive taste yet gets the **cold start**
  (`algorithmVersion: "cold-start-1"`): popular titles from TMDB `discover` for
  the country and services, movies and series alternating, varied genres.
- Weights: effective = clamp(learned + decayed adjustment) in [-1, 1], top 5
  likes and dislikes with TMDB names. Undo removes what is left of the newest
  change not undone; reset empties the adjustment layer and marks pending
  changes undone.

### Taste algorithm (`taste-1`, `src/taste/`)

Requirements 4.1. Pure functions over the TMDB client and the stores.

- **Features** (`features.ts`): `genre`, `keyword` (10), `person` (5 main cast
  and the director or series creators), `decade`, `type`, `runtime`
  (short/medium/long per type). TV-only genres map to the movie genre they mean
  (Action & Adventure → Action), so taste carries across movies and series. They
  come from `tmdb.features()`: keywords and credits, trimmed and cached 30 days.
- **Learned layer** (`learn.ts`), rebuilt on every pool from the newest 200
  signals: each signal adds strength × recency (half-life 14 days) × the
  feature kind's factor to every feature of its title, then weights are scaled
  so the strongest is ±1. Strengths: Watch now 1, Like 0.6, long cover dwell
  0.15, short cover dwell −0.1, Skip −0.6. Saved to `WEIGHTS#LEARNED` with labels.
- **Butler adjustment** decays with a half-life of 7 days.
- **Pool** (`buildPool.ts`): quotas 50 % favourites (TMDB recommendations of the
  newest liked titles, one per seed per round), 30 % genre picks (discover with
  the top 3 genres), 20 % discovery (popular outside known genres). Candidates
  are pre-ranked with list data, then scored with full features (`score.ts`:
  Σ weight × kind factor, plus a small popularity prior). A repeated main genre
  costs 20 % per repeat. Titles with a signal or in the last 3 pools are left
  out. Cards not on my services are dropped and the cold start fills any gap.
- **Config** (`config.ts`): every number above lives in `DEFAULT_TASTE_CONFIG`.
  The item `CONFIG / ACTIVE` can override any field under `taste`, without a
  redeploy, for example `{"taste": {"quotas": {"discovery": 0.3}}}` or
  `{"taste": {"algorithmVersion": "cold-start-1"}}` to roll back.

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
- `taste-construct.ts` (P2): profile, signals, pool and weights routes.

A construct gets a `BackendContext` (`table`, `tmdbSecret`, `addRoute`). Create
each Lambda with `new BackendFunction(this, id, { handler: "<file in
src/handlers>" })`, give it only the IAM actions it uses, and call
`ctx.addRoute({ method, path, handler, throttle? })`. Run
`yarn workspace @firedrift/infra test` to check the cost rules.

### Table design

One table for everything. Profile items share the partition `PROFILE#<profileId>`.

| Item | `pk` | `sk` | Attributes | TTL | Writer |
|---|---|---|---|---|---|
| TMDB cache | `TMDB#<path?query>` (taste features: `TMDB#features:<path?query>`) | `CACHE` | `body` (JSON string) | 6 h – 30 days | catalog (#39), taste (#46) |
| Device profile | `PROFILE#<profileId>` | `PROFILE` | `country`, `services` (number list), `showEverything`, `updatedAt` | — | `PUT /profiles` (#44) |
| Signal | `PROFILE#<profileId>` | `SIGNAL#<signalId>` | the `Signal` fields; put only if new (idempotent) | 30 days | `POST /signals` (#44) |
| Learned weights | `PROFILE#<profileId>` | `WEIGHTS#LEARNED` | `weights` (feature → number), `labels` (feature → name), `updatedAt` | — | pool (#46) |
| Butler adjustment | `PROFILE#<profileId>` | `WEIGHTS#ADJUST` | `weights`, `updatedAt` (decays on read) | — | `update_weights` (#47) |
| Weight change | `PROFILE#<profileId>` | `CHANGE#<at>#<changeId>` | the `WeightChange` fields; last 20 kept | — | `update_weights` (#47) |
| Pool | `PROFILE#<profileId>` | `POOL#<poolId>` | `algorithmVersion`, `titles` (`type` and `tmdbId` only), `createdAt` | 7 days | pool (#44, #46) |
| Config | `CONFIG` | `ACTIVE` | `taste` (any `TasteConfig` field); later butler caps, kill switch, model ID | — | by hand; code has defaults |

Seen titles come from the signals and the last pools, so they need no item of
their own. Weight changes are written by `update_weights` (#47).
