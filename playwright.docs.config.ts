import { defineConfig, devices } from "@playwright/test";

const DOCS_PORT = Number(process.env.PLAYWRIGHT_DOCS_PORT ?? 4173);

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
    command: `cd apps/docs && pnpm docs:build && pnpm exec vitepress preview . --host 127.0.0.1 --port ${DOCS_PORT}`,
    port: DOCS_PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
