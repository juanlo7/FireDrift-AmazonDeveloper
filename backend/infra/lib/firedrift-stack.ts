import { CfnOutput, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import { CfnStage, HttpApi, HttpMethod, HttpStage } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { BackendFunction } from "./backend-function";
import { CatalogConstruct } from "./catalog-construct";
import { TasteConstruct } from "./taste-construct";
import { ButlerConstruct } from "./butler-construct";
import { ToolsConstruct } from "./tools-construct";

export interface Throttle {
  rateLimit: number;
  burstLimit: number;
}

/** Requests per second for every route without its own limit. */
const DEFAULT_THROTTLE: Throttle = { rateLimit: 20, burstLimit: 40 };

export interface RouteProps {
  method: HttpMethod;
  path: string;
  handler: IFunction;
  throttle?: Throttle;
}

/** What every owner's construct receives: shared resources and a way to add routes. */
export interface BackendContext {
  table: TableV2;
  tmdbSecret: Secret;
  addRoute(route: RouteProps): void;
}

export interface FireDriftStackProps extends StackProps {
  envName: string;
}

export class FireDriftStack extends Stack implements BackendContext {
  readonly table: TableV2;
  readonly tmdbSecret: Secret;
  private readonly api: HttpApi;
  private readonly stage: CfnStage;
  private readonly routeSettings: Record<string, { ThrottlingRateLimit: number; ThrottlingBurstLimit: number }> = {};

  constructor(scope: Construct, id: string, props: FireDriftStackProps) {
    super(scope, id, props);

    // Every item lives here; key design in backend/README.md.
    this.table = new TableV2(this, "Table", {
      partitionKey: { name: "pk", type: AttributeType.STRING },
      sortKey: { name: "sk", type: AttributeType.STRING },
      timeToLiveAttribute: "ttl",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Created with a random placeholder; the real TMDB token is put by hand (README).
    this.tmdbSecret = new Secret(this, "TmdbSecret", {
      secretName: `firedrift/${props.envName}/tmdb`,
      description: "TMDB API Read Access Token or v3 API key",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.api = new HttpApi(this, "Api", { createDefaultStage: false });
    const stage = new HttpStage(this, "DefaultStage", {
      httpApi: this.api,
      stageName: "$default",
      autoDeploy: true,
      throttle: DEFAULT_THROTTLE,
    });
    this.stage = stage.node.defaultChild as CfnStage;

    this.addRoute({
      method: HttpMethod.GET,
      path: "/health",
      handler: new BackendFunction(this, "Health", { handler: "health" }),
    });

    new CatalogConstruct(this, "Catalog", this);
    new TasteConstruct(this, "Taste", this);
    const tools = new ToolsConstruct(this, "Tools", this);
    new ButlerConstruct(this, "Butler", this, { tools: tools.functions });

    new CfnOutput(this, "ApiUrl", { value: this.api.apiEndpoint });
    new CfnOutput(this, "TableName", { value: this.table.tableName });
    new CfnOutput(this, "TmdbSecretName", { value: this.tmdbSecret.secretName });
  }

  addRoute({ method, path, handler, throttle }: RouteProps): void {
    const integrationId = `${method}${path}`.replace(/[^A-Za-z0-9]/g, "");
    this.api.addRoutes({
      path,
      methods: [method],
      integration: new HttpLambdaIntegration(integrationId, handler),
    });
    if (throttle) {
      this.routeSettings[`${method} ${path}`] = {
        ThrottlingRateLimit: throttle.rateLimit,
        ThrottlingBurstLimit: throttle.burstLimit,
      };
      this.stage.addPropertyOverride("RouteSettings", this.routeSettings);
    }
  }
}
