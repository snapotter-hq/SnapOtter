// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every stable `code` the API raises must have a row in the error catalog.
 * A code added to apps/api/src without a docs entry fails here, so the page
 * cannot fall behind the source.
 */

const ROOT = path.resolve(__dirname, "../../..");
const API_SRC = path.join(ROOT, "apps/api/src");
const CATALOG = path.join(ROOT, "apps/docs/api/errors.md");
const CODE_LITERAL = /code:\s*"([A-Z][A-Z_]+)"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith(".ts") ? [full] : [];
    });
}

function collectCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of sourceFiles(API_SRC)) {
    for (const match of readFileSync(file, "utf8").matchAll(CODE_LITERAL)) {
      codes.add(match[1]);
    }
  }
  return codes;
}

describe("API error code catalog", () => {
  it("lists every code literal raised under apps/api/src", () => {
    const catalog = readFileSync(CATALOG, "utf8");
    const missing = [...collectCodes()].sort().filter((code) => !catalog.includes(`\`${code}\``));
    expect(missing).toEqual([]);
  });
});
