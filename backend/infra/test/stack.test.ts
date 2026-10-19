import { App, Tags } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, it } from "vitest";
import { FireDriftStack } from "../lib/firedrift-stack";

let template: Template;

beforeAll(() => {
  // Skip esbuild bundling: these tests check the template, not the code.
  const app = new App({ context: { "aws:cdk:bundling-stacks": [], "firedrift:skipAgentPackage": true } });
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

  it("never grants wildcard actions, except CDK's read of its own assets bucket", () => {
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
      ({ Properties }) => Properties.PolicyDocument.Statement as { Action: string | string[]; Resource: unknown }[],
    );
    for (const { Action, Resource } of statements) {
      const onAssets = JSON.stringify(Resource).includes("cdk-hnb659fds-assets-");
      for (const action of [Action].flat()) {
        if (!onAssets) expect(action).not.toContain("*");
      }
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

describe("butler on AgentCore (#48)", () => {
  it("authorizes the Runtime with the device user pool", () => {
    const runtimes = Object.values(template.findResources("AWS::BedrockAgentCore::Runtime"));
    expect(runtimes).toHaveLength(1);
    const auth = JSON.stringify(runtimes[0]!.Properties.AuthorizerConfiguration);
    expect(auth).toContain("cognito-idp");
    expect(auth).toContain("AllowedClients");
    expect(JSON.stringify(runtimes[0]!.Properties.EnvironmentVariables)).toContain("gateway");
  });

  it("lets devices sign up on their own, confirmed by the PreSignUp trigger, with no client secret", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      LambdaConfig: { PreSignUp: Match.anyValue() },
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      GenerateSecret: false,
      ExplicitAuthFlows: Match.arrayWith(["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]),
    });
  });

  it("puts the five agent tools behind an IAM-authorized Gateway", () => {
    template.hasResourceProperties("AWS::BedrockAgentCore::Gateway", { AuthorizerType: "AWS_IAM", ProtocolType: "MCP" });
    const targets = Object.values(template.findResources("AWS::BedrockAgentCore::GatewayTarget"));
    expect(targets.map(({ Properties }) => Properties.Name).sort()).toEqual([
      "get-weights",
      "ranked-picks",
      "resolve-titles",
      "similar",
      "update-weights",
    ]);
  });

  it("limits Bedrock to the two butler models", () => {
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
      ({ Properties }) => Properties.PolicyDocument.Statement as { Action: string | string[]; Resource: unknown }[],
    );
    const bedrock = statements.filter((st) => [st.Action].flat().some((a) => a.startsWith("bedrock:Invoke")));
    expect(bedrock).toHaveLength(1);
    const resources = JSON.stringify(bedrock[0]!.Resource);
    for (const model of ["claude-haiku-4-5-20251001-v1:0", "nova-2-lite-v1:0"]) expect(resources).toContain(model);
    expect(resources).not.toMatch(/foundation-model\/\*"/);
  });

  it("gives the butler a private speech bucket that forgets the audio after a day", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, RestrictPublicBuckets: true },
      LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 1, Status: "Enabled" })] },
    });
    const runtimes = Object.values(template.findResources("AWS::BedrockAgentCore::Runtime"));
    expect(runtimes[0]!.Properties.EnvironmentVariables).toHaveProperty("FIREDRIFT_SPEECH_BUCKET");
    const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
      ({ Properties }) => Properties.PolicyDocument.Statement as { Action: string | string[] }[],
    );
    expect(statements.some((st) => [st.Action].flat().includes("polly:SynthesizeSpeech"))).toBe(true);
    expect(statements.some((st) => [st.Action].flat().includes("transcribe:StartStreamTranscriptionWebSocket"))).toBe(true);
    expect(runtimes[0]!.Properties.EnvironmentVariables).toMatchObject({ FIREDRIFT_TRANSCRIBE: "on" });
  });

  it("lets the butler count turns for its daily caps, and nothing more on the table", () => {
    const runtimePolicy = Object.entries(template.findResources("AWS::IAM::Policy")).find(([id]) =>
      id.startsWith("ButlerAgentRuntimeExecutionRole"),
    )![1];
    const statements = runtimePolicy.Properties.PolicyDocument.Statement as { Action: string | string[] }[];
    const dynamo = statements.flatMap((st) => [st.Action].flat()).filter((a) => a.startsWith("dynamodb:"));
    expect(dynamo.sort()).toEqual(["dynamodb:GetItem", "dynamodb:UpdateItem"]);
  });

  it("outputs what the app needs to connect", () => {
    const outputs = Object.keys(template.findOutputs("*"));
    for (const name of ["RuntimeArn", "ButlerWebSocketUrl", "UserPoolId", "UserPoolClientId", "GatewayUrl"]) {
      expect(outputs.some((key) => key.includes(name))).toBe(true);
    }
  });
});
