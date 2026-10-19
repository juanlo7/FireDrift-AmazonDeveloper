import type { PreSignUpTriggerEvent } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { handler } from "../src/handlers/cognitoPreSignUp";

describe("Cognito PreSignUp", () => {
  it("confirms every device sign-up, since there is no email to verify", async () => {
    const event = { response: { autoConfirmUser: false } } as unknown as PreSignUpTriggerEvent;
    expect((await handler(event)).response.autoConfirmUser).toBe(true);
  });
});
