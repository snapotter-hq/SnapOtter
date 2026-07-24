import { defineConfig } from "vitest/config";
import rootConfig from "./vitest.config";

// Dedicated config for the apps/api mutation lane (Stryker). It reuses the root
// config's full alias map (the api/web/landing node_modules redirects) so the
// api unit tests resolve their dependencies identically, but deliberately drops
// the testcontainer global-setup and the per-fork DB cloning: the tests/unit/api
// suite is pure logic (0 of 140 build a real app), so it needs no Postgres or
// Redis. A tiny env stub supplies the values a few src modules read at import.
const rootResolve = (rootConfig as { resolve?: Record<string, unknown> }).resolve;

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: rootResolve as never,
  test: {
    globals: true,
    include: ["tests/unit/api/**/*.test.ts"],
    // A few files under tests/unit/api actually exercise the real DB (settings
    // table CRUD); they belong to the integration tier and need Postgres. This
    // container-free mutation lane skips them - the modules they cover are still
    // exercised by the full integration suite, just not by this lane.
    exclude: [
      "tests/unit/api/settings-helpers.test.ts",
      "tests/unit/api/tool-routes-boot-log.test.ts",
      // Source-drift guards that readFileSync a source file and regex its text.
      // Stryker instruments the source, changing its text, so those assertions
      // fail under mutation. They stay in the normal suite; behavioral coverage
      // of these modules comes from their sibling *.behavior / kill tests.
      "tests/unit/api/compute-delete-after.test.ts",
      "tests/unit/api/siem-forward.test.ts",
      "tests/unit/api/alert-evaluator.test.ts",
      "tests/unit/api/storage-reconciliation.test.ts",
    ],
    setupFiles: ["tests/setup/stryker-api-env.ts"],
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
