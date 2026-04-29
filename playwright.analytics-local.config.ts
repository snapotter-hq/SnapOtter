import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const authFile = path.join(__dirname, "test-results", ".auth", "analytics-local-user.json");
const testDbPath = path.join(__dirname, "test-results", ".e2e-analytics-db", "snapotter.db");

const TEST_API_PORT = 13491;
const TEST_WEB_PORT = 2350;

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
      command: `rm -f "${testDbPath}" "${testDbPath}-shm" "${testDbPath}-wal" && mkdir -p "${path.dirname(testDbPath)}" && pnpm --filter @snapotter/api dev`,
      port: TEST_API_PORT,
      reuseExistingServer: !process.env.CI,
      env: {
        AUTH_ENABLED: "true",
        DEFAULT_USERNAME: "admin",
        DEFAULT_PASSWORD: "admin",
        RATE_LIMIT_PER_MIN: "50000",
        SKIP_MUST_CHANGE_PASSWORD: "true",
        ANALYTICS_ENABLED: "true",
        DB_PATH: testDbPath,
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
