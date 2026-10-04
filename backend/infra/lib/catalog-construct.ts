import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { BackendFunction } from "./backend-function";
import type { BackendContext } from "./firedrift-stack";

/** Catalog routes (TMDB). Owner: P1. Handlers in `backend/src/handlers/`. */
export class CatalogConstruct extends Construct {
  constructor(scope: Construct, id: string, ctx: BackendContext) {
    super(scope, id);

    const environment = {
      TABLE_NAME: ctx.table.tableName,
      TMDB_SECRET_ID: ctx.tmdbSecret.secretArn,
    };

    const routes = [
      { id: "GetProviders", handler: "getProviders", path: "/providers" },
      { id: "GetTitle", handler: "getTitle", path: "/titles/{type}/{tmdbId}" },
    ];

    for (const route of routes) {
      const fn = new BackendFunction(this, route.id, { handler: route.handler, environment });
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
          resources: [ctx.table.tableArn],
        }),
      );
      fn.addToRolePolicy(
        new PolicyStatement({
          actions: ["secretsmanager:GetSecretValue"],
          resources: [ctx.tmdbSecret.secretArn],
        }),
      );
      ctx.addRoute({ method: HttpMethod.GET, path: route.path, handler: fn });
    }
  }
}
