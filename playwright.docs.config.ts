import { defineConfig, devices } from "@playwright/test";

const DOCS_PORT = 5173;

export default defineConfig({
  testDir: "./tests/e2e-docs",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: `http://localhost:${DOCS_PORT}`,
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
    command: "pnpm --filter @snapotter/docs docs:dev",
    port: DOCS_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
