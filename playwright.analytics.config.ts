import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

function resolveRunId(): string {
  const runId = process.env.PLAYWRIGHT_RUN_ID ?? `${process.pid}_${randomBytes(4).toString("hex")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(runId)) {
    throw new Error(
      `PLAYWRIGHT_RUN_ID must be 1-64 letters, digits, underscores, or hyphens and start with a letter or digit, received ${JSON.stringify(runId)}`,
    );
  }
  process.env.PLAYWRIGHT_RUN_ID = runId;
  return runId;
}

const runId = resolveRunId();
const runRoot = path.join(__dirname, "test-results", "e2e-docker-runs", runId);
const authFile = path.join(runRoot, "auth", "analytics-user.json");
process.env.PLAYWRIGHT_RUN_ROOT = runRoot;
process.env.PLAYWRIGHT_AUTH_FILE = authFile;

const baseURL = process.env.BASE_URL ?? "http://localhost:1349";
process.env.API_URL = baseURL;

export default defineConfig({
  testDir: "./tests/e2e-docker",
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: path.join(runRoot, "playwright-output"),
  reporter: [
    ["html", { open: "never", outputFolder: path.join(runRoot, "playwright-report") }],
    ["list"],
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /(?:^|[/\\])auth\.setup\.ts$/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile,
      },
      dependencies: ["setup"],
    },
  ],
});

export { authFile };
