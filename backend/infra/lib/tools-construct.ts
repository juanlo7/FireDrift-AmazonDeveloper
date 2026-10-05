import { CfnOutput, Duration } from "aws-cdk-lib";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { BackendFunction } from "./backend-function";
import type { BackendContext } from "./firedrift-stack";

interface Tool {
  id: string;
  name: string;
  handler: string;
  tableActions: string[];
  readsTmdb?: boolean;
  timeout?: Duration;
}

const READ_WEIGHTS = ["dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:GetItem"];

const TOOLS: Tool[] = [
  { id: "GetWeightsTool", name: "get_weights", handler: "tools/getWeights", tableActions: READ_WEIGHTS },
  {
    id: "UpdateWeightsTool",
    name: "update_weights",
    handler: "tools/updateWeights",
    // DeleteItem trims the change history to the last 20.
    tableActions: [...READ_WEIGHTS, "dynamodb:PutItem", "dynamodb:DeleteItem"],
  },
  {
    id: "RankedPicksTool",
    name: "ranked_picks",
    handler: "tools/rankedPicks",
    tableActions: [...READ_WEIGHTS, "dynamodb:PutItem"],
    readsTmdb: true,
    timeout: Duration.seconds(20),
  },
];

/**
 * Weight tools for the butler agent (#47). Owner: P2. No HTTP route: AgentCore
 * Gateway (#48) invokes them, using the ARNs in the stack outputs.
 */
export class ToolsConstruct extends Construct {
  constructor(scope: Construct, id: string, ctx: BackendContext) {
    super(scope, id);

    const environment = {
      TABLE_NAME: ctx.table.tableName,
      TMDB_SECRET_ID: ctx.tmdbSecret.secretArn,
    };

    for (const tool of TOOLS) {
      const fn = new BackendFunction(this, tool.id, { handler: tool.handler, environment, timeout: tool.timeout });
      fn.addToRolePolicy(new PolicyStatement({ actions: tool.tableActions, resources: [ctx.table.tableArn] }));
      if (tool.readsTmdb) {
        fn.addToRolePolicy(
          new PolicyStatement({ actions: ["secretsmanager:GetSecretValue"], resources: [ctx.tmdbSecret.secretArn] }),
        );
      }
      new CfnOutput(this, `${tool.id}Arn`, { value: fn.functionArn, description: `Lambda of the ${tool.name} tool` });
    }
  }
}
