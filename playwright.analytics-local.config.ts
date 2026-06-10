import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const authFile = path.join(__dirname, "test-results", ".auth", "analytics-local-user.json");

const TEST_API_PORT = 13491;
const TEST_WEB_PORT = 2350;

// Fresh Postgres database per analytics-local e2e run (same mechanism as the
// main playwright.config.ts).
const E2E_PG_BASE_URL =
  process.env.E2E_PG_BASE_URL || "postgres://snapotter:snapotter@localhost:5432/snapotter";
const e2eDbName = `snapotter_e2e_${process.pid}_${randomBytes(4).toString("hex")}`;
const e2eDatabaseUrl = (() => {
  const url = new URL(E2E_PG_BASE_URL);
  url.pathname = `/${e2eDbName}`;
  return url.toString();
})();

export default defineConfig({
  testDir: "./tests/e2e-analytics",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${TEST_WEB_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
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
      command: `node tests/e2e-pg-create-db.cjs ${e2eDbName} && pnpm --filter @snapotter/api dev`,
      port: TEST_API_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        AUTH_ENABLED: "true",
        DEFAULT_USERNAME: "admin",
        DEFAULT_PASSWORD: "admin",
        RATE_LIMIT_PER_MIN: "50000",
        SKIP_MUST_CHANGE_PASSWORD: "true",
        ANALYTICS_ENABLED: "true",
        DATABASE_URL: e2eDatabaseUrl,
        PORT: String(TEST_API_PORT),
      },
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @snapotter/web dev",
      port: TEST_WEB_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(TEST_WEB_PORT),
        VITE_API_URL: `http://localhost:${TEST_API_PORT}`,
      },
      timeout: 30_000,
    },
  ],
});

export { authFile };
