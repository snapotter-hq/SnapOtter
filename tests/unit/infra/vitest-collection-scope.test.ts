import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The root vitest config pins collection to explicit roots (issue #947);
 * before that, vitest's whole-checkout default glob collected stray files
 * anywhere in the working tree and failed the run on the first one that was
 * not a vitest suite. The cost of an explicit include is the opposite
 * failure: a test file added outside the pinned roots stops running and
 * nothing complains. These assertions make that drop loud.
 */

const root = path.resolve(import.meta.dirname, "../../..");

/** The include contract in vitest.config.ts; filename pattern is vitest's default. */
const VITEST_INCLUDE = [
  "tests/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)",
  "tests/integration/**/*.{test,spec}.?(c|m)[jt]s?(x)",
  "packages/*/tests/**/*.{test,spec}.?(c|m)[jt]s?(x)",
];

/** Directory prefixes those globs collect from. */
const VITEST_ROOTS = [/^tests\/unit\//, /^tests\/integration\//, /^packages\/[^/]+\/tests\//];

/** Test-named trees that run under a Playwright config on purpose, never vitest. */
const PLAYWRIGHT_ROOTS = [/^tests\/e2e[^/]*\//, /^tests\/qa\//];

/** What vitest's default filename pattern matches. */
const TEST_FILENAME = /\.(test|spec)\.[cm]?[jt]sx?$/;

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\n")
    .filter(Boolean);
}

describe("vitest collection scope", () => {
  it("keeps the explicit include in the root config", () => {
    const config = readFileSync(path.join(root, "vitest.config.ts"), "utf8");
    for (const glob of VITEST_INCLUDE) {
      expect(config, `vitest.config.ts must include "${glob}"`).toContain(`"${glob}"`);
    }
  });

  it("gives every tracked test-named file a collection owner", () => {
    const orphans = trackedFiles().filter((file) => {
      if (!TEST_FILENAME.test(file)) return false;
      if (VITEST_ROOTS.some((prefix) => prefix.test(file))) return false;
      if (PLAYWRIGHT_ROOTS.some((prefix) => prefix.test(file))) return false;
      return true;
    });
    expect(
      orphans,
      "these test files are outside every collected root, so pnpm test silently skips them; " +
        "move them under tests/unit, tests/integration, or packages/<pkg>/tests, or extend " +
        "the include in vitest.config.ts and VITEST_ROOTS in this guard",
    ).toEqual([]);
  });
});
