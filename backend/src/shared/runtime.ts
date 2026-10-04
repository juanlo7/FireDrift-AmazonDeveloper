import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createDynamoDbCache, createLayeredCache, createMemoryCache } from "../catalog/cache";
import { createCatalogService, type CatalogService } from "../catalog/catalogService";
import { createTmdbClient, parseTmdbSecret, type TmdbCredentials } from "../catalog/tmdbClient";
import { createDynamoDbProfileStore, type ProfileStore } from "../profile/profileStore";

/**
 * Lambda environment, set by the CDK stack (#43):
 * - `TABLE_NAME`: the single DynamoDB table (keys `pk`, `sk`; TTL attribute `ttl`).
 * - `TMDB_SECRET_ID`: Secrets Manager secret whose value is the TMDB token or API key.
 */
const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

export interface CatalogRuntime {
  catalog: CatalogService;
  profiles: ProfileStore;
}

let runtime: CatalogRuntime | undefined;
let credentials: Promise<TmdbCredentials> | undefined;

/** Built once per Lambda instance and reused on warm invocations. */
export const getCatalogRuntime = (): CatalogRuntime => {
  if (runtime) return runtime;

  const tableName = requireEnv("TABLE_NAME");
  const secretId = requireEnv("TMDB_SECRET_ID");
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const secrets = new SecretsManagerClient({});

  const loadCredentials = () => {
    credentials ??= secrets
      .send(new GetSecretValueCommand({ SecretId: secretId }))
      .then(({ SecretString }) => {
        if (!SecretString) throw new Error("TMDB secret is empty");
        return parseTmdbSecret(SecretString);
      })
      .catch((cause) => {
        credentials = undefined; // retry on the next call
        throw cause;
      });
    return credentials;
  };

  const tmdb = createTmdbClient({
    credentials: loadCredentials,
    cache: createLayeredCache(createMemoryCache(), createDynamoDbCache(doc, tableName)),
  });

  runtime = {
    catalog: createCatalogService(tmdb),
    profiles: createDynamoDbProfileStore(doc, tableName),
  };
  return runtime;
};
