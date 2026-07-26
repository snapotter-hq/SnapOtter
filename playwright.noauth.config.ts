import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightBackingState } from "./tests/playwright-backing-state.mjs";
import { resolvePlaywrightEndpoint, resolvePlaywrightRun } from "./tests/playwright-run.js";

// AUTH_ENABLED=false is a supported deployment mode: the API injects a synthetic
// anonymous user carrying the admin role so a single-user self-host reaches the
// whole app without a login. Every other Playwright config here boots the API
// with authentication ON, so this mode had no browser-level coverage at all and
// a regression would only surface on a user's machine. A webServer belongs to a
// config rather than a project, so covering a second API mode needs its own
// config rather than another project in playwright.config.ts.
const { runId, runRoot } = resolvePlaywrightRun(__dirname, "noauth");
const apiEndpoint = resolvePlaywrightEndpoint(
  "PLAYWRIGHT_NOAUTH_API_PORT",
  "PLAYWRIGHT_NOAUTH_API_URL",
  25_000,
);
const webEndpoint = resolvePlaywrightEndpoint(
  "PLAYWRIGHT_NOAUTH_WEB_PORT",
  "PLAYWRIGHT_NOAUTH_WEB_URL",
  45_000,
);
process.env.API_URL = apiEndpoint.url;
const webDistDir = path.join(runRoot, "web-dist");

const backingState = resolvePlaywrightBackingState({
  postgresBaseUrl:
    process.env.E2E_PG_BASE_URL || "postgres://snapotter:snapotter@localhost:5432/snapotter",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  runId,
  scope: "noauth",
});

export default defineConfig({
  testDir: "./tests/e2e-noauth",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: [["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }]],
  use: {
    baseURL: webEndpoint.url,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // No auth setup project and no storageState: reaching the app without ever
  // presenting a credential is the behaviour under test.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node tests/playwright-api-lifecycle.mjs ${runId} noauth -- pnpm --filter @snapotter/api start`,
      url: `${apiEndpoint.url}/api/v1/health`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
      env: {
        PORT: String(apiEndpoint.port),
        AUTH_ENABLED: "false",
        RATE_LIMIT_PER_MIN: "50000",
        ANALYTICS_ENABLED: "false",
        DATABASE_URL: backingState.databaseUrl,
        E2E_PG_BASE_URL: backingState.postgresBaseUrl,
        REDIS_URL: backingState.redisUrl,
        BULLMQ_PREFIX: backingState.bullmqPrefix,
        DATA_DIR: path.join(runRoot, "data"),
        FILES_STORAGE_PATH: path.join(runRoot, "files"),
        WORKSPACE_PATH: path.join(runRoot, "workspace"),
        FEATURE_MANIFEST_PATH: path.join(runRoot, ".no-feature-manifest.json"),
      },
      timeout: 60_000,
    },
    {
      // Run-scoped output directory, so a concurrent run's build cannot empty
      // the assets this run's preview server is serving.
      command: `pnpm --filter @snapotter/web exec tsc -b && pnpm --filter @snapotter/web exec vite build --outDir ${webDistDir} --emptyOutDir && exec pnpm --filter @snapotter/web exec vite preview --outDir ${webDistDir} --host ${webEndpoint.host} --port ${webEndpoint.port} --strictPort`,
      url: webEndpoint.url,
      reuseExistingServer: false,
      env: {
        PORT: String(webEndpoint.port),
        VITE_API_URL: apiEndpoint.url,
      },
      timeout: 240_000,
    },
  ],
});
