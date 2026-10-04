import { App, Tags } from "aws-cdk-lib";
import { FireDriftStack } from "../lib/firedrift-stack";

const app = new App();
const envName = app.node.tryGetContext("env") ?? "dev";
if (envName !== "dev" && envName !== "prod") {
  throw new Error(`Unknown env "${envName}": use -c env=dev or -c env=prod`);
}

new FireDriftStack(app, `FireDrift-${envName}`, {
  envName,
  env: { region: "us-east-1" },
});

Tags.of(app).add("project", "firedrift");
Tags.of(app).add("env", envName);
