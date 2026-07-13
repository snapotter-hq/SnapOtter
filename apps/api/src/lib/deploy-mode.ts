import { existsSync } from "node:fs";

export type DeployMode = "embedded" | "external" | "native";

// All-in-one detection: docker/entrypoint.sh exports EMBEDDED_MODE=1 before
// exec'ing s6-overlay, and the snapotter service run script is with-contenv,
// so the marker reaches this process. URL absence is not a usable signal:
// embedded mode sets loopback DATABASE_URL/REDIS_URL before boot, and native
// dev commonly leaves DATABASE_URL unset (config.ts defaults it).
export function deployMode(): DeployMode {
  if (process.env.EMBEDDED_MODE) return "embedded";
  if (existsSync("/.dockerenv")) return "external";
  return "native";
}
