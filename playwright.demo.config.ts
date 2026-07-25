import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightEndpoint, resolvePlaywrightRun } from "./tests/playwright-run.js";

const { runRoot } = resolvePlaywrightRun(__dirname, "demo");
const endpoint = resolvePlaywrightEndpoint("PLAYWRIGHT_DEMO_PORT", "PLAYWRIGHT_DEMO_URL", 40_000);

export default defineConfig({
  testDir: "./tests/e2e-demo",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }],
      ]
    : [
        ["list"],
        ["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }],
      ],
  use: {
    baseURL: endpoint.url,
    ...devices["Desktop Chrome"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm --filter @snapotter/demo build && exec pnpm --filter @snapotter/demo exec vite preview --host ${endpoint.host} --port ${endpoint.port} --strictPort`,
    url: endpoint.url,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
