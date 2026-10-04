import { getProfileRuntime } from "../shared/runtime";
import { createWeightsHandler } from "./weights";

export const handler = createWeightsHandler("reset", getProfileRuntime);
