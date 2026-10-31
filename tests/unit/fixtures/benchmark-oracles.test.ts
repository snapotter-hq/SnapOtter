import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertOracle, isoDurationS } from "../../benchmark/lib/oracles.mjs";

const TESTS_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURES_ROOT = join(TESTS_ROOT, "fixtures");

describe("benchmark media duration oracles (#3369)", () => {
  it("reads the 30.112s mvhd duration from video/valid/media-30s.mp4", () => {
    const mp4 = readFileSync(join(FIXTURES_ROOT, "video/valid/media-30s.mp4"));
    const duration = isoDurationS(mp4);
    expect(duration).toBeCloseTo(30.112, 2);
    expect(() => assertOracle(mp4, { durationS: 30.112, toleranceS: 0.01 })).not.toThrow();
    expect(() => assertOracle(mp4, { durationS: 8, toleranceS: 0.5 })).toThrow(
      /oracle durationS: expected 8 \+\/- 0\.5, measured 30\.112/,
    );
  });

  it("passes the standalone node:test oracle suite in tests/benchmark/oracles.node-test.mjs", () => {
    const suitePath = join(TESTS_ROOT, "benchmark/oracles.node-test.mjs");
    const result = spawnSync(process.execPath, ["--test", suitePath], {
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/(?:#|ℹ) pass 12\b/);
    expect(result.stdout).toMatch(/(?:#|ℹ) fail 0\b/);
  });
});
