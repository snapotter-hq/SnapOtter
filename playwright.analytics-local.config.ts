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
      // NOTE: use the `start` script, not `dev`. The `dev` script hard-codes
      // `PORT=13490`, which would override the isolated TEST_API_PORT below and
      // collide with a developer's running dev server. `start` reads PORT from
      // the env, so the PORT set in this webServer.env block is honored.
      command: `node tests/e2e-pg-create-db.cjs ${e2eDbName} && pnpm --filter @snapotter/api start`,
      port: TEST_API_PORT,
      reuseExistingServer: !process.env.CI,
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
        DATABASE_URL: e2eDatabaseUrl,
        REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
        BULLMQ_PREFIX: e2eDbName,
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
