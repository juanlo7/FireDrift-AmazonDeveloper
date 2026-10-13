import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  AgentCoreRuntime,
  AgentRuntimeArtifact,
  Gateway,
  GatewayAuthorizer,
  Runtime,
  RuntimeAuthorizerConfiguration,
  SchemaDefinitionType,
  ToolSchema,
  type SchemaDefinition,
} from "aws-cdk-lib/aws-bedrockagentcore";
import { AccountRecovery, UserPool, UserPoolOperation } from "aws-cdk-lib/aws-cognito";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import { BlockPublicAccess, Bucket, BucketEncryption } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import { BackendFunction } from "./backend-function";
import type { BackendContext } from "./firedrift-stack";

const AGENT_DIR = path.resolve(__dirname, "../../../agent");

/** The models the butler may use (D16): Claude Haiku 4.5, and Nova 2 Lite as fallback. */
const MODELS = [
  { profile: "us.anthropic.claude-haiku-4-5-20251001-v1:0", base: "anthropic.claude-haiku-4-5-20251001-v1:0" },
  { profile: "us.amazon.nova-2-lite-v1:0", base: "amazon.nova-2-lite-v1:0" },
];

const str = (description: string): SchemaDefinition => ({ type: SchemaDefinitionType.STRING, description });
const int = (description: string): SchemaDefinition => ({ type: SchemaDefinitionType.INTEGER, description });
const profileId = str("Butler session profile; set by the agent, never by the model");

/** Tool input schemas of docs/contracts.md section 5, by Gateway target name. */
const TOOL_SCHEMAS: Record<string, { tool: string; description: string; inputSchema: SchemaDefinition }> = {
  "get-weights": {
    tool: "get_weights",
    description: "Compact summary of the user's taste weights",
    inputSchema: { type: SchemaDefinitionType.OBJECT, properties: { profileId }, required: ["profileId"] },
  },
  "update-weights": {
    tool: "update_weights",
    description: "Change up to 3 taste weights in the butler adjustment layer",
    inputSchema: {
      type: SchemaDefinitionType.OBJECT,
      properties: {
        profileId,
        changes: {
          type: SchemaDefinitionType.ARRAY,
          items: {
            type: SchemaDefinitionType.OBJECT,
            properties: { feature: str("Feature key, for example genre:27"), delta: { type: SchemaDefinitionType.NUMBER } },
            required: ["feature", "delta"],
          },
        },
        reason: str("Why, in the user's words"),
      },
      required: ["profileId", "changes", "reason"],
    },
  },
  "resolve-titles": {
    tool: "resolve_titles",
    description: "Check proposed titles against TMDB; only resolved titles can be shown",
    inputSchema: {
      type: SchemaDefinitionType.OBJECT,
      properties: {
        profileId,
        proposals: {
          type: SchemaDefinitionType.ARRAY,
          description: "Up to 5",
          items: {
            type: SchemaDefinitionType.OBJECT,
            properties: {
              title: str("Title as the user would know it"),
              year: int("Release year; leave out if unsure"),
              type: str("movie or series"),
            },
            required: ["title", "type"],
          },
        },
      },
      required: ["profileId", "proposals"],
    },
  },
  similar: {
    tool: "similar",
    description: "Titles similar to one TMDB title, on the user's services",
    inputSchema: {
      type: SchemaDefinitionType.OBJECT,
      properties: { profileId, type: str("movie or series"), tmdbId: int("TMDB ID"), count: int("Up to 10") },
      required: ["profileId", "type", "tmdbId", "count"],
    },
  },
  "ranked-picks": {
    tool: "ranked_picks",
    description: "Best titles for the user from the taste algorithm",
    inputSchema: { type: SchemaDefinitionType.OBJECT, properties: { profileId, count: int("Up to 10") }, required: ["profileId", "count"] },
  },
};

/**
 * Builds the Runtime code package (agent/scripts/package.sh) during synth.
 * Tests set the context `firedrift:skipAgentPackage` and get an empty folder.
 */
const agentPackage = (scope: Construct): string => {
  const out = path.join(AGENT_DIR, ".build", "runtime");
  if (scope.node.tryGetContext("firedrift:skipAgentPackage")) return path.join(AGENT_DIR, "server");
  execFileSync(path.join(AGENT_DIR, "scripts", "package.sh"), [out], { stdio: "inherit" });
  return out;
};

export interface ButlerConstructProps {
  /** Tool Lambdas by tool name, from the tools construct. */
  tools: Record<string, IFunction>;
}

/**
 * The butler on AgentCore (#48): anonymous Cognito sign-in for devices, the agent
 * on AgentCore Runtime (WebSocket at /ws) and the tools behind AgentCore Gateway. Owner: P2.
 */
export class ButlerConstruct extends Construct {
  constructor(scope: Construct, id: string, ctx: BackendContext, props: ButlerConstructProps) {
    super(scope, id);
    const stack = Stack.of(this);

    // Each device signs up with its profile ID and a random password it keeps; no email.
    const userPool = new UserPool(this, "DevicePool", {
      selfSignUpEnabled: true,
      signInAliases: { username: true },
      autoVerify: {},
      accountRecovery: AccountRecovery.NONE,
      passwordPolicy: { minLength: 20, requireSymbols: false },
      removalPolicy: RemovalPolicy.DESTROY,
    });
    userPool.addTrigger(UserPoolOperation.PRE_SIGN_UP, new BackendFunction(this, "PreSignUp", { handler: "cognitoPreSignUp" }));
    const appClient = userPool.addClient("TvApp", {
      authFlows: { userPassword: true },
      generateSecret: false,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    const gateway = new Gateway(this, "ToolsGateway", {
      description: "FireDrift agent tools (contracts section 5)",
      authorizerConfiguration: GatewayAuthorizer.usingAwsIam(),
    });
    for (const [target, schema] of Object.entries(TOOL_SCHEMAS)) {
      const fn = props.tools[schema.tool];
      if (!fn) throw new Error(`No Lambda for tool ${schema.tool}`);
      gateway.addLambdaTarget(`${target}-target`, {
        gatewayTargetName: target,
        description: schema.description,
        lambdaFunction: fn,
        toolSchema: ToolSchema.fromInline([{ name: schema.tool, description: schema.description, inputSchema: schema.inputSchema }]),
      });
    }

    // Polly MP3s of the butler's answers, read by the app through short-lived presigned
    // URLs. Never the user's voice (NFR-6). A day is enough for any session.
    const speechBucket = new Bucket(this, "SpeechBucket", {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(1) }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const runtime = new Runtime(this, "AgentRuntime", {
      runtimeName: `firedrift_butler_${stack.stackName.replace(/[^A-Za-z0-9]/g, "_")}`.slice(0, 48),
      description: "FireDrift butler agent (WebSocket at /ws)",
      agentRuntimeArtifact: AgentRuntimeArtifact.fromCodeAsset({
        path: agentPackage(this),
        runtime: AgentCoreRuntime.PYTHON_3_12,
        entrypoint: ["main.py"],
      }),
      authorizerConfiguration: RuntimeAuthorizerConfiguration.usingCognito(userPool, [appClient]),
      lifecycleConfiguration: { idleRuntimeSessionTimeout: Duration.minutes(10), maxLifetime: Duration.hours(1) },
      environmentVariables: {
        FIREDRIFT_TOOLS: "gateway",
        FIREDRIFT_GATEWAY_URL: gateway.gatewayUrl ?? "",
        TABLE_NAME: ctx.table.tableName,
        FIREDRIFT_SPEECH_BUCKET: speechBucket.bucketName,
      },
    });
    runtime.addToRolePolicy(
      new PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: MODELS.flatMap((m) => [
          stack.formatArn({ service: "bedrock", resource: "inference-profile", resourceName: m.profile }),
          // A us.* profile may route to any US region.
          `arn:${stack.partition}:bedrock:*::foundation-model/${m.base}`,
        ]),
      }),
    );
    // GetItem reads the runtime config; UpdateItem counts turns for the daily caps (#55).
    runtime.addToRolePolicy(
      new PolicyStatement({ actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"], resources: [ctx.table.tableArn] }),
    );
    runtime.addToRolePolicy(new PolicyStatement({ actions: ["polly:SynthesizeSpeech"], resources: ["*"] }));
    // Put the MP3, and get it so the presigned URL the Runtime signs works.
    runtime.addToRolePolicy(
      new PolicyStatement({
        actions: ["s3:PutObject", "s3:GetObject"],
        resources: [speechBucket.arnForObjects("speech/*")],
      }),
    );
    gateway.grantInvoke(runtime);

    new CfnOutput(this, "RuntimeArn", { value: runtime.agentRuntimeArn });
    new CfnOutput(this, "ButlerWebSocketUrl", {
      value: `wss://bedrock-agentcore.${stack.region}.amazonaws.com/runtimes/${runtime.agentRuntimeArn}/ws`,
      description: "Encode the runtime ARN in the URL path when connecting",
    });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: appClient.userPoolClientId });
    new CfnOutput(this, "GatewayUrl", { value: gateway.gatewayUrl ?? "" });
  }
}
