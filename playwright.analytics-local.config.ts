import { randomBytes, randomInt } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightBackingState } from "./tests/playwright-backing-state.mjs";

function resolveRunId(): string {
  const runId = process.env.PLAYWRIGHT_RUN_ID ?? `${process.pid}_${randomBytes(4).toString("hex")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(runId)) {
    throw new Error(
      `PLAYWRIGHT_RUN_ID must be 1-64 letters, digits, underscores, or hyphens and start with a letter or digit, received ${JSON.stringify(runId)}`,
    );
  }
  process.env.PLAYWRIGHT_RUN_ID = runId;
  return runId;
}

type E2eEndpoint = {
  port: number;
  url: string;
};

function parsePort(value: string, envName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${envName} must be an integer port, received "${value}"`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${envName} must be between 1024 and 65535, received "${value}"`);
  }
  return port;
}

function randomPort(min: number): number {
  return randomInt(min, min + 10_000);
}

function resolveEndpoint(kind: "API" | "WEB", defaultPortFloor: number): E2eEndpoint {
  const portEnvName = `PLAYWRIGHT_${kind}_PORT`;
  const urlEnvName = `PLAYWRIGHT_${kind}_URL`;
  const urlOverride = process.env[urlEnvName] ?? (kind === "API" ? process.env.API_URL : undefined);
  const parsedOverride = urlOverride ? new URL(urlOverride) : undefined;
  const port = process.env[portEnvName]
    ? parsePort(process.env[portEnvName], portEnvName)
    : parsedOverride?.port
      ? parsePort(parsedOverride.port, urlEnvName)
      : randomPort(defaultPortFloor);
  const parsedUrl = parsedOverride ?? new URL(`http://127.0.0.1:${port}`);

  if (parsedUrl.protocol !== "http:") {
    throw new Error(`${urlEnvName} must use http, received "${parsedUrl.protocol}"`);
  }
  if (!["127.0.0.1", "localhost"].includes(parsedUrl.hostname)) {
    throw new Error(`${urlEnvName} must use a loopback host, received "${parsedUrl.hostname}"`);
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
  return { port, url };
}

const runId = resolveRunId();
const runRoot = path.join(__dirname, "test-results", "e2e-analytics-runs", runId);
const authFile = path.join(runRoot, "auth", "analytics-local-user.json");
process.env.PLAYWRIGHT_RUN_ROOT = runRoot;
process.env.PLAYWRIGHT_AUTH_FILE = authFile;

const apiEndpoint = resolveEndpoint("API", 20_000);
const webEndpoint = resolveEndpoint("WEB", 30_000);
process.env.API_URL = apiEndpoint.url;

const E2E_PG_BASE_URL =
  process.env.E2E_PG_BASE_URL || "postgres://snapotter:snapotter@localhost:5432/snapotter";
const backingState = resolvePlaywrightBackingState({
  postgresBaseUrl: E2E_PG_BASE_URL,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  runId,
  scope: "analytics-local",
});

export default defineConfig({
  testDir: "./tests/e2e-analytics",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: [["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }]],
  use: {
    baseURL: webEndpoint.url,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /(?:^|[/\\])auth\.setup\.ts$/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      // NOTE: use the `start` script, not `dev`. The `dev` script hard-codes
      // `PORT=13490`, which would override the isolated API endpoint below and
      // collide with a developer's running dev server. `start` reads PORT from
      // the env, so the PORT set in this webServer.env block is honored.
      command: `node tests/playwright-api-lifecycle.mjs ${runId} analytics-local -- pnpm --filter @snapotter/api start`,
      url: `${apiEndpoint.url}/api/v1/health`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
      env: {
        AUTH_ENABLED: "true",
        DEFAULT_USERNAME: "admin",
        DEFAULT_PASSWORD: "admin",
        RATE_LIMIT_PER_MIN: "50000",
        SKIP_MUST_CHANGE_PASSWORD: "true",
        ANALYTICS_ENABLED: "true",
        // Force the compile-time bake ON (dev/test only) so the effective
        // analytics state is enabled by default and the opt-out toggle can be
        // exercised end to end. bakedEnabled() honors this when
        // NODE_ENV !== "production".
        ANALYTICS_BAKED_OVERRIDE: "on",
        DATABASE_URL: backingState.databaseUrl,
        E2E_PG_BASE_URL: backingState.postgresBaseUrl,
        REDIS_URL: backingState.redisUrl,
        BULLMQ_PREFIX: backingState.bullmqPrefix,
        PORT: String(apiEndpoint.port),
      },
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @snapotter/web dev",
      url: webEndpoint.url,
      reuseExistingServer: false,
      env: {
        PORT: String(webEndpoint.port),
        VITE_API_URL: apiEndpoint.url,
      },
      timeout: 30_000,
    },
  ],
});

export { authFile };
