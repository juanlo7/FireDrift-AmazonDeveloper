import * as path from "node:path";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const HANDLERS_DIR = path.join(REPO_ROOT, "backend/src/handlers");

export interface BackendFunctionProps {
  /** File name in `backend/src/handlers/`, without extension. It must export `handler`. */
  handler: string;
  environment?: Record<string, string>;
  /** Defaults to 10 s. */
  timeout?: Duration;
}

/** Lambda with the cost rules of requirements section 7: ARM, small, short, logs kept 7 days. */
export class BackendFunction extends NodejsFunction {
  constructor(scope: Construct, id: string, props: BackendFunctionProps) {
    super(scope, id, {
      entry: path.join(HANDLERS_DIR, `${props.handler}.ts`),
      handler: "handler",
      projectRoot: REPO_ROOT,
      depsLockFilePath: path.join(REPO_ROOT, "yarn.lock"),
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: props.timeout ?? Duration.seconds(10),
      environment: props.environment,
      logGroup: new LogGroup(scope, `${id}Logs`, {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      bundling: { minify: true, sourceMap: true, target: "node22" },
    });
  }
}
