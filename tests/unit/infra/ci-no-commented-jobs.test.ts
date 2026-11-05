import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A commented-out Docker build job sat in ci.yml with unpinned action tags
 * (#4328). Commented-out logic is banned, and re-enabling a block like that
 * would bring unpinned actions back in. A disabled step or job is deleted, or
 * tracked in an issue instead.
 */
describe("ci.yml", () => {
  it("has no commented-out steps or jobs", () => {
    const lines = readFileSync(
      resolve(import.meta.dirname, "../../../.github/workflows/ci.yml"),
      "utf8",
    ).split("\n");
    const dead = lines
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /^\s*#\s*(- uses:|uses:|runs-on:|steps:|needs:)/.test(line));
    expect(dead.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
  });
});
