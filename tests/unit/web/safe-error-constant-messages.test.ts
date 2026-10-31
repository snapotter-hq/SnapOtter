import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// A SafeError message goes to Sentry verbatim and must be a constant string
// (packages/shared/src/tool-errors.ts). The web app once put "(HTTP ${status})"
// into four of them, because the scrubber dropped every other way to report a
// status (#1351). A status now rides on `statusCode` as the status_code tag, so
// an interpolated message has no excuse left. This turns that rule into a check.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const TREE = "apps/web/src";
const INTERPOLATED_MESSAGE = /new\s+SafeError\(\s*`[^`]*\$\{/g;

function sourceFiles(): string[] {
  return readdirSync(join(ROOT, TREE), { recursive: true })
    .map(String)
    .filter((p) => (p.endsWith(".ts") || p.endsWith(".tsx")) && !p.includes(".test."))
    .map((p) => join(TREE, p));
}

describe("web SafeError messages are constant (#1351)", () => {
  const files = sourceFiles();

  it("finds source files", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("the check catches an interpolated message", () => {
    expect("throw new SafeError(`upload failed (HTTP ${res.status})`, {})").toMatch(
      new RegExp(INTERPOLATED_MESSAGE.source),
    );
    expect('throw new SafeError("upload failed", { statusCode })').not.toMatch(
      new RegExp(INTERPOLATED_MESSAGE.source),
    );
  });

  it("no SafeError message interpolates a value", () => {
    const violations: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(ROOT, file), "utf-8");
      for (const match of text.matchAll(INTERPOLATED_MESSAGE)) {
        const line = text.slice(0, match.index).split("\n").length;
        violations.push(`${file}:${line}`);
      }
    }
    expect(violations, "put the variable part in code or statusCode instead").toEqual([]);
  });
});
