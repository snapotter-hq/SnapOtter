import { randomBytes, randomInt } from "node:crypto";
import path from "node:path";

export interface PlaywrightEndpoint {
  host: string;
  port: number;
  url: string;
}

export function resolvePlaywrightRun(repoRoot: string, scope: string) {
  const runId = process.env.PLAYWRIGHT_RUN_ID ?? `${process.pid}_${randomBytes(4).toString("hex")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(runId)) {
    throw new Error(
      `PLAYWRIGHT_RUN_ID must be 1-64 letters, digits, underscores, or hyphens and start with a letter or digit, received ${JSON.stringify(runId)}`,
    );
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(scope)) {
    throw new Error(`Playwright run scope is invalid: ${JSON.stringify(scope)}`);
  }

  const runRoot = path.join(repoRoot, "test-results", "e2e-runs", runId, scope);
  process.env.PLAYWRIGHT_RUN_ID = runId;
  process.env.PLAYWRIGHT_RUN_ROOT = runRoot;
  return { runId, runRoot };
}

function parsePort(value: string, envName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${envName} must be an integer port, received ${JSON.stringify(value)}`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${envName} must be between 1024 and 65535, received ${JSON.stringify(value)}`);
  }
  return port;
}

function randomPort(floor: number): number {
  return randomInt(floor, floor + 10_000);
}

export function resolvePlaywrightEndpoint(
  portEnvName: string,
  urlEnvName: string,
  defaultPortFloor: number,
): PlaywrightEndpoint {
  const urlOverride = process.env[urlEnvName];
  const parsedOverride = urlOverride ? new URL(urlOverride) : undefined;
  const port = process.env[portEnvName]
    ? parsePort(process.env[portEnvName], portEnvName)
    : parsedOverride?.port
      ? parsePort(parsedOverride.port, urlEnvName)
      : randomPort(defaultPortFloor);
  const parsedUrl = parsedOverride ?? new URL(`http://127.0.0.1:${port}`);

  if (parsedUrl.protocol !== "http:") {
    throw new Error(`${urlEnvName} must use http, received ${JSON.stringify(parsedUrl.protocol)}`);
  }
  if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
    throw new Error(
      `${urlEnvName} must use a loopback host, received ${JSON.stringify(parsedUrl.hostname)}`,
    );
  }
  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(`${urlEnvName} must be an origin without credentials, path, query, or hash`);
  }
  if (parsePort(parsedUrl.port || "80", urlEnvName) !== port) {
    throw new Error(`${portEnvName} must match the port in ${urlEnvName}`);
  }

  const url = parsedUrl.origin;
  process.env[portEnvName] = String(port);
  process.env[urlEnvName] = url;
  return { host: parsedUrl.hostname, port, url };
}
