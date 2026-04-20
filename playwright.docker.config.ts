import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const authFile = path.join(__dirname, "test-results", ".auth", "user.json");

// Point raw-fetch tests (api.spec, security.spec, people.spec, rbac.spec) at
// the Docker container instead of the dev-server default (port 13490).
// Start the container with: SKIP_MUST_CHANGE_PASSWORD=true docker compose -f docker/docker-compose.yml up -d
process.env.API_URL ??= "http://localhost:1349";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 600_000,
  expect: {
    timeout: 60_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:1349",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
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
  // No webServer — tests run against the Docker container at localhost:1349
});

export { authFile };
