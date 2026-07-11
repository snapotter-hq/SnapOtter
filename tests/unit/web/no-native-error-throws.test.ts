import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The web Sentry scrubber treats native error classes (TypeError, RangeError,
// and friends) as browser/runtime faults: their messages pass through with
// redaction instead of being replaced wholesale. That is only safe while our
// own code never throws those classes, so own-code throws must stay plain
// Error (or an app-specific subclass). This turns that grep into an invariant.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const TREES = ["apps/web/src", "packages/shared/src"];
const NATIVE_THROW =
  /throw\s+new\s+(TypeError|RangeError|SyntaxError|ReferenceError|DOMException)\s*\(/;

function sourceFiles(tree: string): string[] {
  return readdirSync(join(ROOT, tree), { recursive: true })
    .map(String)
    .filter((p) => (p.endsWith(".ts") || p.endsWith(".tsx")) && !p.includes(".test."))
    .map((p) => join(tree, p));
}

describe("no native error-class throws in web/shared source", () => {
  const files = TREES.flatMap(sourceFiles);

  it("finds source files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("own code throws plain Error, never native error classes", () => {
    const violations: string[] = [];
    for (const file of files) {
      const lines = readFileSync(join(ROOT, file), "utf-8").split("\n");
      lines.forEach((line, i) => {
        if (NATIVE_THROW.test(line)) violations.push(`${file}:${i + 1}`);
      });
    }
    expect(violations, "use plain Error so the Sentry scrubber fully redacts").toEqual([]);
  });
});
