import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// QA sweep config: drives the isolated QA Docker container (auth off) with REAL
// Google Chrome (channel "chrome") so proprietary codecs (H.264/AAC/MP3) decode
// and media previews are valid. No webServer: the container is external.
//
//   docker compose -f tests/qa/docker-compose.qa.yml up -d
//   pnpm playwright test --config tests/qa/playwright.qa.config.ts

const QA_BASE_URL = process.env.QA_BASE_URL || "http://localhost:13499";
const repoRoot = path.join(__dirname, "..", "..");

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.qa\.spec\.ts$/,
  // Generous default; long/AI specs raise their own via test.setTimeout().
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.QA_RETRIES ? Number(process.env.QA_RETRIES) : 0,
  // Conservative: the same machine runs the container doing FFmpeg/LibreOffice/AI.
  workers: process.env.QA_WORKERS ? Number(process.env.QA_WORKERS) : 4,
  reporter: [
    ["list"],
    ["json", { outputFile: path.join(repoRoot, "docs", "qa", "results.json") }],
    ["html", { open: "never", outputFolder: path.join(repoRoot, "test-results", "qa-report") }],
  ],
  outputDir: path.join(repoRoot, "test-results", "qa-artifacts"),
  use: {
    baseURL: QA_BASE_URL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "qa-chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
