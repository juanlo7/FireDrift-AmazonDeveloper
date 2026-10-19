import { Duration } from "aws-cdk-lib";
import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { BackendFunction } from "./backend-function";
import type { BackendContext } from "./firedrift-stack";

interface TasteRoute {
  id: string;
  handler: string;
  method: HttpMethod;
  path: string;
  tableActions: string[];
  readsTmdb?: boolean;
  timeout?: Duration;
}

const PROFILE = "/profiles/{profileId}";

const ROUTES: TasteRoute[] = [
  { id: "PutProfile", handler: "putProfile", method: HttpMethod.PUT, path: PROFILE, tableActions: ["dynamodb:PutItem"] },
  {
    id: "PostSignals",
    handler: "postSignals",
    method: HttpMethod.POST,
    path: `${PROFILE}/signals`,
    tableActions: ["dynamodb:PutItem"],
  },
  {
    id: "GetPool",
    handler: "getPool",
    method: HttpMethod.GET,
    path: `${PROFILE}/pool`,
    tableActions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:BatchGetItem"],
    readsTmdb: true,
    // The first pool of a profile can make about 80 TMDB calls before the cache warms up.
    timeout: Duration.seconds(20),
  },
  {
    id: "GetWeights",
    handler: "getWeights",
    method: HttpMethod.GET,
    path: `${PROFILE}/weights`,
    tableActions: ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:GetItem"],
  },
  {
    id: "UndoWeights",
    handler: "undoWeights",
    method: HttpMethod.POST,
    path: `${PROFILE}/weights/undo`,
    tableActions: ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:PutItem", "dynamodb:GetItem"],
  },
  {
    id: "ResetWeights",
    handler: "resetWeights",
    method: HttpMethod.POST,
    path: `${PROFILE}/weights/reset`,
    tableActions: ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:PutItem", "dynamodb:GetItem"],
  },
];

/** Profile, signals, pool and weights routes (#44, #46). Owner: P2. */
export class TasteConstruct extends Construct {
  constructor(scope: Construct, id: string, ctx: BackendContext) {
    super(scope, id);

    const environment = {
      TABLE_NAME: ctx.table.tableName,
      TMDB_SECRET_ID: ctx.tmdbSecret.secretArn,
    };

    for (const route of ROUTES) {
      const fn = new BackendFunction(this, route.id, {
        handler: route.handler,
        environment,
        timeout: route.timeout,
      });
      fn.addToRolePolicy(new PolicyStatement({ actions: route.tableActions, resources: [ctx.table.tableArn] }));
      if (route.readsTmdb) {
        fn.addToRolePolicy(
          new PolicyStatement({
            actions: ["secretsmanager:GetSecretValue"],
            resources: [ctx.tmdbSecret.secretArn],
          }),
        );
      }
      ctx.addRoute({ method: route.method, path: route.path, handler: fn });
    }
  }
}
