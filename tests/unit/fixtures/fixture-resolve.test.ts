import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fixtures, flattenFixturePaths, readFixture } from "../../fixtures/index.js";

describe("fixture registry resolves", () => {
  const paths = flattenFixturePaths(fixtures);

  it("registers at least the known core fixtures", () => {
    expect(paths.length).toBeGreaterThan(50); // ~71 expected; floor is a sanity check
  });

  it.each(paths)("exists and is a non-empty file: %s", (p) => {
    expect(existsSync(p), `missing fixture: ${p}`).toBe(true);
    expect(statSync(p).size, `zero-byte fixture: ${p}`).toBeGreaterThan(0);
  });

  it("readFixture returns bytes for the workhorse PNG", () => {
    expect(readFixture(fixtures.image.base.png200).byteLength).toBeGreaterThan(0);
  });
});
