import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightEndpoint, resolvePlaywrightRun } from "./tests/playwright-run.js";

const { runRoot } = resolvePlaywrightRun(__dirname, "editor");
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

const postgresBaseUrl =
  process.env.E2E_PG_BASE_URL || "postgres://snapotter:snapotter@localhost:5432/snapotter";
const databaseName = `snapotter_e2e_editor_${process.pid}_${randomBytes(4).toString("hex")}`;
const databaseUrl = (() => {
  const url = new URL(postgresBaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
})();

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
      command: `node tests/e2e-pg-create-db.cjs ${databaseName} && exec pnpm --filter @snapotter/api start`,
      url: `${apiEndpoint.url}/api/v1/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(apiEndpoint.port),
        AUTH_ENABLED: "true",
        DEFAULT_USERNAME: "admin",
        DEFAULT_PASSWORD: "admin",
        RATE_LIMIT_PER_MIN: "50000",
        LOGIN_ATTEMPT_LIMIT: "100000",
        SKIP_MUST_CHANGE_PASSWORD: "true",
        ANALYTICS_ENABLED: "false",
        DATABASE_URL: databaseUrl,
        REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
        BULLMQ_PREFIX: databaseName,
        DATA_DIR: path.join(runRoot, "data"),
        FILES_STORAGE_PATH: path.join(runRoot, "files"),
        WORKSPACE_PATH: path.join(runRoot, "workspace"),
        FEATURE_MANIFEST_PATH: path.join(runRoot, ".no-feature-manifest.json"),
      },
      timeout: 30_000,
    },
    {
      command: `pnpm --filter @snapotter/web build && exec pnpm --filter @snapotter/web exec vite preview --host ${webEndpoint.host} --port ${webEndpoint.port} --strictPort`,
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
