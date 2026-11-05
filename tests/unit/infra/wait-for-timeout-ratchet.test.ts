import { globSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AGENTS.md bans static timeouts in new tests, but nothing enforced it (#4333).
 * Existing `waitForTimeout` calls are pinned per file in the allowlist. A new
 * call, or a new file using one, fails here. A file that burns calls down must
 * lower its count in the allowlist, so the list only shrinks.
 */
const ROOT = resolve(import.meta.dirname, "../../..");
const ALLOWLIST = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "wait-for-timeout-allowlist.json"), "utf8"),
) as Record<string, number>;

const CALL = /\bwaitForTimeout\s*\(/g;

function countCalls(source: string): number {
  return source.split("\n").reduce((total, line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      return total;
    }
    return total + (line.match(CALL)?.length ?? 0);
  }, 0);
}

function currentCounts(): Record<string, number> {
  const files = globSync("tests/**/*.{ts,tsx,mts,js,mjs,cjs}", {
    cwd: ROOT,
    exclude: (name) => name === "node_modules",
  });
  const counts: Record<string, number> = {};
  for (const file of files.sort()) {
    if (file.includes("wait-for-timeout-ratchet") || !statSync(resolve(ROOT, file)).isFile()) {
      continue;
    }
    const n = countCalls(readFileSync(resolve(ROOT, file), "utf8"));
    if (n > 0) counts[file] = n;
  }
  return counts;
}

describe("waitForTimeout ratchet", () => {
  const counts = currentCounts();

  it("counts calls, not comments", () => {
    expect(countCalls("// await page.waitForTimeout(5)\nawait page.waitForTimeout(5);")).toBe(1);
  });

  it("allows no waitForTimeout call beyond the allowlist", () => {
    const added = Object.entries(counts)
      .filter(([file, n]) => n > (ALLOWLIST[file] ?? 0))
      .map(([file, n]) => `${file}: ${n} calls, ${ALLOWLIST[file] ?? 0} allowed`);
    expect(
      added,
      "wait on an explicit condition instead of waitForTimeout (AGENTS.md, Testing)",
    ).toEqual([]);
  });

  it("keeps the allowlist tight, so burned-down calls are removed from it", () => {
    const stale = Object.entries(ALLOWLIST)
      .filter(([file, allowed]) => (counts[file] ?? 0) < allowed)
      .map(([file, allowed]) => `${file}: ${counts[file] ?? 0} calls, ${allowed} allowed`);
    expect(stale, "lower or delete these entries in wait-for-timeout-allowlist.json").toEqual([]);
  });
});
