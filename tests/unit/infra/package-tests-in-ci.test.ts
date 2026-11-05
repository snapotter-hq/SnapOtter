import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The engine packages keep their own suites under `packages/<name>/tests/`.
 * The root vitest config collects them, but PR CI ran only `tests/unit/` and
 * `tests/integration/`, so an engine regression could merge green (#4314).
 * Every package suite has to be named on the sharded unit-test command.
 */
const ROOT = resolve(import.meta.dirname, "../../..");
const PACKAGES = ["image-engine", "media-engine", "doc-engine"];

function unitTestCommand(): string {
  const ci = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
  const line = ci.split("\n").find((l) => /run: pnpm vitest run tests\/unit\/.*--shard/.test(l));
  expect(line, "the sharded unit-test command in ci.yml").toBeDefined();
  return line as string;
}

describe("PR CI unit-test command", () => {
  for (const name of PACKAGES) {
    it(`runs packages/${name}/tests`, () => {
      expect(existsSync(resolve(ROOT, `packages/${name}/tests`))).toBe(true);
      expect(unitTestCommand()).toContain(`packages/${name}/tests`);
    });
  }
});
