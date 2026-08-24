import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanToolUiLiterals } from "../../helpers/tool-ui-literals.js";

/**
 * Drift guard for #906: no user-facing English literals in tool settings
 * panels. Every rendered string (JSX text, placeholder/title/aria-label/alt/
 * label attributes, rendered string expressions) must come from i18n, except
 * the locale-invariant values in tool-ui-literal-allowlist.json.
 */

const TOOLS_DIR = path.resolve(__dirname, "../../../apps/web/src/components/tools");
const ALLOWLIST_PATH = path.resolve(__dirname, "tool-ui-literal-allowlist.json");

describe("tool UI literal drift (#906)", () => {
  it("renders no unallowlisted English literals in components/tools", () => {
    const allow = new Set<string>(
      (JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as { values: string[] }).values,
    );
    const offenders = scanToolUiLiterals(TOOLS_DIR).filter((h) => !allow.has(h.text));
    const summary = offenders
      .slice(0, 50)
      .map((h) => `${h.file}:${h.line} [${h.kind}] ${JSON.stringify(h.text)}`)
      .join("\n");
    expect(
      offenders.length,
      `Found ${offenders.length} hardcoded user-facing literals (first 50):\n${summary}\n` +
        "Route them through useTranslation() keys, or add locale-invariant values to tool-ui-literal-allowlist.json.",
    ).toBe(0);
  });

  it("keeps the allowlist free of entries that no longer occur", () => {
    const allow = (JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as { values: string[] }).values;
    const present = new Set(scanToolUiLiterals(TOOLS_DIR).map((h) => h.text));
    const stale = allow.filter((v) => !present.has(v));
    expect(stale, `Allowlist entries with no remaining occurrence: ${stale.join(", ")}`).toEqual(
      [],
    );
  });
});
