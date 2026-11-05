import "dotenv/config";
import { loadEnv, publishSidecarEnv } from "./lib/env.js";

export const env = loadEnv();
publishSidecarEnv(env);
