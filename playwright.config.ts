import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const authFile = path.join(__dirname, "test-results", ".auth", "user.json");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
      caret: "hide",
    },
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:1349",
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
      command: "pnpm --filter @stirling-image/api dev",
      port: 13490,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: "13490",
        AUTH_ENABLED: "true",
        DEFAULT_USERNAME: "admin",
        DEFAULT_PASSWORD: "admin",
        RATE_LIMIT_PER_MIN: "50000",
        SKIP_MUST_CHANGE_PASSWORD: "true",
      },
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @stirling-image/web dev",
      port: 1349,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});

export { authFile };
