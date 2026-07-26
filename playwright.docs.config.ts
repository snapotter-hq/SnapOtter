import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { resolvePlaywrightEndpoint, resolvePlaywrightRun } from "./tests/playwright-run.js";

const { runRoot } = resolvePlaywrightRun(__dirname, "docs");
const endpoint = resolvePlaywrightEndpoint("PLAYWRIGHT_DOCS_PORT", "PLAYWRIGHT_DOCS_URL", 40_000);

export default defineConfig({
  testDir: "./tests/e2e-docs",
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
    command: `cd apps/docs && pnpm docs:build && exec pnpm exec vitepress preview . --host ${endpoint.host} --port ${endpoint.port}`,
    url: endpoint.url,
    reuseExistingServer: false,
    // `vitepress build` renders ~3,800 pages and then runs Pagefind over them,
    // which is about two minutes warm and longer on a loaded machine. At 120s the
    // whole suite died on webServer startup before a single test ran.
    timeout: 600_000,
  },
});
