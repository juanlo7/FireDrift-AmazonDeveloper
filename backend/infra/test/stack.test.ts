import { App, Tags } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { FireDriftStack } from "../lib/firedrift-stack";

let template: Template;

beforeAll(() => {
  // Skip esbuild bundling: these tests check the template, not the code.
  const app = new App({ context: { "aws:cdk:bundling-stacks": [] } });
  const stack = new FireDriftStack(app, "FireDrift-test", { envName: "dev", env: { region: "us-east-1" } });
  Tags.of(app).add("project", "firedrift");
  Tags.of(app).add("env", "dev");
  template = Template.fromStack(stack);
});

describe("cost rules (requirements section 7)", () => {
  it("runs every Lambda on ARM with small memory, a short timeout and no VPC", () => {
    const functions = template.findResources("AWS::Lambda::Function");
    expect(Object.keys(functions).length).toBeGreaterThanOrEqual(3);
    for (const [logicalId, { Properties }] of Object.entries(functions)) {
      expect(Properties.Architectures).toEqual(["arm64"]);
      expect(Properties.MemorySize).toBeLessThanOrEqual(256);
      // Only the pool builders may take longer: their first run warms the TMDB cache.
      expect(Properties.Timeout).toBeLessThanOrEqual(/^(TasteGetPool|ToolsRankedPicksTool)/.test(logicalId) ? 20 : 10);
      expect(Properties.VpcConfig).toBeUndefined();
    }
  });

  it("keeps logs 7 days", () => {
    const groups = Object.values(template.findResources("AWS::Logs::LogGroup"));
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const { Properties } of groups) expect(Properties.RetentionInDays).toBe(7);
  });

  it("uses an on-demand table with pk, sk and a ttl attribute", () => {
    template.hasResourceProperties("AWS::DynamoDB::GlobalTable", {
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    });
  });

  it("has no NAT gateway, VPC or load balancer", () => {
    template.resourceCountIs("AWS::EC2::NatGateway", 0);
    template.resourceCountIs("AWS::EC2::VPC", 0);
    template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
  });

  it("throttles the API stage", () => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      StageName: "$default",
      DefaultRouteSettings: { ThrottlingRateLimit: 20, ThrottlingBurstLimit: 40 },
    });
  });

  it("tags resources with project and env", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Tags: Match.arrayWith([
        { Key: "env", Value: "dev" },
        { Key: "project", Value: "firedrift" },
      ]),
    });
  });
});

describe("routes", () => {
  it.each([
    "GET /health",
    "GET /providers",
    "GET /titles/{type}/{tmdbId}",
    "PUT /profiles/{profileId}",
    "POST /profiles/{profileId}/signals",
    "GET /profiles/{profileId}/pool",
    "GET /profiles/{profileId}/weights",
    "POST /profiles/{profileId}/weights/undo",
    "POST /profiles/{profileId}/weights/reset",
  ])("exposes %s", (routeKey) => {
    template.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: routeKey });
  });

  const actionsOf = (policyPrefix: string) => {
    const policies = template.findResources("AWS::IAM::Policy");
    const [, policy] = Object.entries(policies).find(([logicalId]) => logicalId.startsWith(policyPrefix)) ?? [];
    expect(policy, policyPrefix).toBeDefined();
    return new Set(
      policy!.Properties.PolicyDocument.Statement.flatMap((statement: { Action: string | string[] }) =>
        [statement.Action].flat(),
      ),
    );
  };

  it.each([
    ["CatalogGetProviders", ["dynamodb:GetItem", "dynamodb:PutItem", "secretsmanager:GetSecretValue"]],
    ["CatalogGetTitle", ["dynamodb:GetItem", "dynamodb:PutItem", "secretsmanager:GetSecretValue"]],
    ["TastePutProfile", ["dynamodb:PutItem"]],
    ["TastePostSignals", ["dynamodb:PutItem"]],
    [
      "TasteGetPool",
      ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:BatchGetItem", "secretsmanager:GetSecretValue"],
    ],
    ["TasteGetWeights", ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:GetItem"]],
    ["ToolsGetWeightsTool", ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:GetItem"]],
    [
      "ToolsUpdateWeightsTool",
      ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
    ],
    [
      "ToolsRankedPicksTool",
      ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "secretsmanager:GetSecretValue"],
    ],
  ])("gives %s only the actions it uses", (prefix, actions) => {
    expect(actionsOf(prefix)).toEqual(new Set(actions));
  });

  it("never grants wildcard actions", () => {
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
      ({ Properties }) => Properties.PolicyDocument.Statement as { Action: string | string[] }[],
    );
    for (const { Action } of statements) {
      for (const action of [Action].flat()) expect(action).not.toContain("*");
    }
  });

  it("exposes the agent tools only through stack outputs, not HTTP routes", () => {
    const outputs = Object.keys(template.findOutputs("*"));
    for (const tool of ["GetWeightsTool", "UpdateWeightsTool", "RankedPicksTool"]) {
      expect(outputs.some((name) => name.includes(`${tool}Arn`))).toBe(true);
    }
    const routes = Object.values(template.findResources("AWS::ApiGatewayV2::Route"));
    expect(routes.every(({ Properties }) => !String(Properties.RouteKey).includes("tool"))).toBe(true);
  });
});
