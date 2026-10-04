import { getProfileRuntime } from "../shared/runtime";
import { createWeightsHandler } from "./weights";

export const handler = createWeightsHandler("summary", getProfileRuntime);
