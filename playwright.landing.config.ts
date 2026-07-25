import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightEndpoint, resolvePlaywrightRun } from "./tests/playwright-run.js";

const { runRoot } = resolvePlaywrightRun(__dirname, "landing");
const endpoint = resolvePlaywrightEndpoint(
  "PLAYWRIGHT_LANDING_PORT",
  "PLAYWRIGHT_LANDING_URL",
  40_000,
);

export default defineConfig({
  testDir: "./tests/e2e-landing",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  workers: 1,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: [["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }]],
  use: {
    baseURL: endpoint.url,
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
    command: `cd apps/landing && PLAYWRIGHT=1 pnpm build && exec pnpm exec astro preview --host ${endpoint.host} --port ${endpoint.port}`,
    url: endpoint.url,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
