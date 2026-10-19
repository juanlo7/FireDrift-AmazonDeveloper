import type { PreSignUpTriggerEvent } from "aws-lambda";

/**
 * Butler devices sign up on their own with their profile ID and a random password
 * kept on the device; there is no email to verify, so every sign-up is confirmed.
 */
export const handler = async (event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> => {
  event.response.autoConfirmUser = true;
  return event;
};
