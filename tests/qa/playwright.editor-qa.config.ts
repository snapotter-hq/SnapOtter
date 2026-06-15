import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Editor QA config: drives the isolated QA Docker container (auth off).
// The editor is mostly client-side Konva, so it is light on the container.
//
//   docker compose -f tests/qa/docker-compose.qa.yml up -d
//   pnpm playwright test --config tests/qa/playwright.editor-qa.config.ts --workers=2

const QA_BASE_URL = process.env.QA_BASE_URL || "http://localhost:13499";
const repoRoot = path.join(__dirname, "..", "..");

export default defineConfig({
  testDir: ".",
  testMatch: /editor\.qa\.spec\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: path.join(repoRoot, "docs", "qa", "editor-results.json"),
      },
    ],
  ],
  outputDir: path.join(repoRoot, "test-results", "qa-editor-artifacts"),
  use: {
    baseURL: QA_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "qa-editor-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
