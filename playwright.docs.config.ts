import { defineConfig, devices } from "@playwright/test";

const DOCS_PORT = 4173;

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
    command:
      "pnpm --filter @snapotter/docs docs:build && pnpm --filter @snapotter/docs docs:preview",
    port: DOCS_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
