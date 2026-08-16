import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightBackingState } from "./tests/playwright-backing-state.mjs";
import { resolvePlaywrightEndpoint, resolvePlaywrightRun } from "./tests/playwright-run.js";

const { runId, runRoot } = resolvePlaywrightRun(__dirname, "editor");
if (!process.env.PLAYWRIGHT_EDITOR_WEB_PORT && process.env.EDITOR_TEST_PORT) {
  process.env.PLAYWRIGHT_EDITOR_WEB_PORT = process.env.EDITOR_TEST_PORT;
}
const apiEndpoint = resolvePlaywrightEndpoint(
  "PLAYWRIGHT_EDITOR_API_PORT",
  "PLAYWRIGHT_EDITOR_API_URL",
  30_000,
);
const webEndpoint = resolvePlaywrightEndpoint(
  "PLAYWRIGHT_EDITOR_WEB_PORT",
  "PLAYWRIGHT_EDITOR_WEB_URL",
  50_000,
);
process.env.EDITOR_TEST_PORT = String(webEndpoint.port);
process.env.API_URL = apiEndpoint.url;
const webDistDir = path.join(runRoot, "web-dist");

const postgresBaseUrl =
  process.env.E2E_PG_BASE_URL || "postgres://snapotter:snapotter@localhost:5432/snapotter";
const backingState = resolvePlaywrightBackingState({
  postgresBaseUrl,
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  runId,
  scope: "editor",
});

export default defineConfig({
  testDir: "./tests/e2e-editor",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: [["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }]],
  use: {
    baseURL: webEndpoint.url,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `node tests/playwright-api-lifecycle.mjs ${runId} editor -- pnpm --filter @snapotter/api start`,
      url: `${apiEndpoint.url}/api/v1/health`,
      reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
      env: {
        PORT: String(apiEndpoint.port),
        AUTH_ENABLED: "true",
        DEFAULT_USERNAME: "admin",
        DEFAULT_PASSWORD: "admin",
        RATE_LIMIT_PER_MIN: "50000",
        LOGIN_ATTEMPT_LIMIT: "100000",
        LOGIN_THROTTLE_MAX_FAILURES: "100000",
        SKIP_MUST_CHANGE_PASSWORD: "true",
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
      timeout: 30_000,
    },
    {
      // Run-scoped output directory: vite empties it before writing, so sharing
      // the default apps/web/dist lets a concurrent run delete the assets this
      // run's preview server is still serving.
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
