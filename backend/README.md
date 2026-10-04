# FireDrift backend

Lambdas in TypeScript for the HTTP API (`docs/contracts.md`, section 2) and the
agent tools. The CDK stack that deploys them is #43.

```sh
yarn workspace @firedrift/backend typecheck
yarn workspace @firedrift/backend test
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

## What the CDK stack (#43) has to provide

| Item | Value |
|---|---|
| `TABLE_NAME` env | The single table: partition key `pk` (string), sort key `sk` (string), TTL attribute `ttl` |
| `TMDB_SECRET_ID` env | Secrets Manager secret ID or ARN. Value: the TMDB API Read Access Token (plain string) or a v3 API key |
| IAM | `dynamodb:GetItem`, `dynamodb:PutItem` on the table; `secretsmanager:GetSecretValue` on the secret |
| Runtime | Node.js 22, ARM, 256 MB, 10 s timeout. Bundle the handlers with esbuild (`NodejsFunction`) |

Items this code reads and writes in the table:

| Item | `pk` | `sk` | Attributes |
|---|---|---|---|
| TMDB cache | `TMDB#<path?query>` | `CACHE` | `body` (JSON string), `ttl` |
| Device profile (read only, written by #45) | `PROFILE#<profileId>` | `PROFILE` | `services` (number list), `showEverything` |

The profile keys are a proposal; change `src/profile/profileStore.ts` if #45
stores profiles differently.
