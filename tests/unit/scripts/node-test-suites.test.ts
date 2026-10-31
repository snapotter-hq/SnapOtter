import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const TESTS_ROOT = join(REPO_ROOT, "tests");

const NODE_TEST_SUITES: ReadonlyArray<{ path: string; minPass: number }> = [
  { path: "tests/benchmark/benchmark-scripts.node-test.mjs", minPass: 18 },
  { path: "tests/benchmark/job-aware.node-test.mjs", minPass: 17 },
  { path: "tests/unit/scripts/run-fuzz-gate.node-test.mjs", minPass: 4 },
  { path: "tests/unit/scripts/campaign-runner.node-test.mjs", minPass: 13 },
];

const EXTERNAL_WRAPPED_SUITES: ReadonlyArray<{ suite: string; wrapper: string }> = [
  {
    suite: "tests/benchmark/oracles.node-test.mjs",
    wrapper: "tests/unit/fixtures/benchmark-oracles.test.ts",
  },
];

function collectNodeTestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return collectNodeTestFiles(fullPath);
    if (!entry.name.endsWith(".node-test.mjs")) return [];
    return [relative(REPO_ROOT, fullPath).replace(/\\/g, "/")];
  });
}

describe("standalone node:test suites (#3374)", () => {
  it("covers every *.node-test.mjs file under tests/ in a Vitest unit test wrapper", () => {
    for (const { suite, wrapper } of EXTERNAL_WRAPPED_SUITES) {
      const wrapperPath = join(REPO_ROOT, wrapper);
      expect(existsSync(wrapperPath), `missing wrapper ${wrapper}`).toBe(true);
      expect(readFileSync(wrapperPath, "utf8")).toContain(suite.replace(/^tests\//, ""));
    }

    const configured = [
      ...NODE_TEST_SUITES.map((entry) => entry.path),
      ...EXTERNAL_WRAPPED_SUITES.map((entry) => entry.suite),
    ];
    expect(new Set(configured).size).toBe(configured.length);

    const discovered = collectNodeTestFiles(TESTS_ROOT).sort();
    expect(discovered).toEqual([...configured].sort());
  });

  for (const { path, minPass } of NODE_TEST_SUITES) {
    it(`passes the standalone node:test suite in ${path}`, () => {
      const suitePath = join(REPO_ROOT, path);
      const result = spawnSync(process.execPath, ["--test", "--test-reporter=spec", suitePath], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 25_000,
      });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status, output).toBe(0);

      const totalMatch = result.stdout.match(/(?:#|ℹ) tests (\d+)\b/);
      const passMatch = result.stdout.match(/(?:#|ℹ) pass (\d+)\b/);
      expect(totalMatch, output).not.toBeNull();
      expect(passMatch, output).not.toBeNull();

      const total = Number(totalMatch?.[1]);
      const passed = Number(passMatch?.[1]);
      expect(passed, output).toBeGreaterThanOrEqual(minPass);
      expect(passed, output).toBe(total);
      expect(result.stdout, output).toMatch(/(?:#|ℹ) fail 0\b/);
      expect(result.stdout, output).toMatch(/(?:#|ℹ) cancelled 0\b/);
      expect(result.stdout, output).toMatch(/(?:#|ℹ) skipped 0\b/);
      expect(result.stdout, output).toMatch(/(?:#|ℹ) todo 0\b/);
    }, 30_000);
  }
});
