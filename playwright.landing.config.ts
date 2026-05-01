import { defineConfig, devices } from "@playwright/test";

const LANDING_PORT = 4350;

export default defineConfig({
  testDir: "./tests/e2e-landing",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${LANDING_PORT}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `cd apps/landing && npx next dev -p ${LANDING_PORT}`,
    port: LANDING_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
