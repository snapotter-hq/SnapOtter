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
    // A placeholder PostHog key so the build emits the analytics snippet and
    // the emitted-output spec can check it landed in every head. The host is
    // an unroutable loopback port: the SDK fetch fails instantly and nothing
    // leaves the machine.
    command: `cd apps/landing && PLAYWRIGHT=1 PUBLIC_POSTHOG_KEY=phc_playwright_placeholder PUBLIC_POSTHOG_HOST=http://127.0.0.1:1 pnpm build && exec pnpm exec astro preview --host ${endpoint.host} --port ${endpoint.port}`,
    url: endpoint.url,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
