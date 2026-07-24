import { defineConfig, devices } from "@playwright/test";

const LANDING_PORT = Number(process.env.PLAYWRIGHT_LANDING_PORT ?? 4350);

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
    command: `cd apps/landing && PLAYWRIGHT=1 pnpm build && pnpm exec astro preview --host 127.0.0.1 --port ${LANDING_PORT}`,
    port: LANDING_PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
