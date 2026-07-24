import { defineConfig } from "vitest/config";
import rootConfig from "./vitest.config";

// Container-free mutation lane for packages/shared (and packages/enterprise).
// The shared/enterprise unit suites are pure logic, so this drops the
// testcontainer global-setup and per-fork DB cloning and reuses the root
// config's alias map. Mirrors vitest.stryker-api.config.ts.
const rootResolve = (rootConfig as { resolve?: Record<string, unknown> }).resolve;

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: rootResolve as never,
  test: {
    globals: true,
    include: ["tests/unit/shared/**/*.test.ts", "tests/unit/api/license-*.test.ts"],
    setupFiles: ["tests/setup/stryker-api-env.ts"],
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
