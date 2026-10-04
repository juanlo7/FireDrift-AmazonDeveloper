import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { CatalogService } from "../catalog/catalogService";
import { COUNTRY_PATTERN, error, fromError, json, type HttpResult } from "../shared/http";
import { getCatalogRuntime } from "../shared/runtime";

/** `GET /providers?country=ES` → `{ providers: { providerId, name, logoUrl }[] }`. */
export const createGetProvidersHandler =
  (deps: () => { catalog: CatalogService }) =>
  async (event: APIGatewayProxyEventV2): Promise<HttpResult> => {
    const country = event.queryStringParameters?.country?.toUpperCase();
    if (!country || !COUNTRY_PATTERN.test(country)) {
      return error(400, "invalid_country", "country must be an ISO 3166-1 alpha-2 code.");
    }
    try {
      return json(200, await deps().catalog.listProviders(country), 3600);
    } catch (cause) {
      return fromError(cause);
    }
  };

export const handler = createGetProvidersHandler(getCatalogRuntime);
