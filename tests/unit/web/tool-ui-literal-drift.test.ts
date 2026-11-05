import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanToolUiLiterals } from "../../helpers/tool-ui-literals.js";

/**
 * Drift guard for #906 and #909: no user-facing English literals anywhere in the
 * web app. Every rendered string (JSX text, placeholder/title/aria-label/alt/
 * label attributes, rendered string expressions, and strings that reach the
 * screen through a local variable) must come from i18n, except the
 * locale-invariant values in tool-ui-literal-allowlist.json.
 *
 * The scan is recursive over apps/web/src, so a directory added later is
 * covered without touching this file.
 */

const WEB_SRC = path.resolve(__dirname, "../../../apps/web/src");
const ALLOWLIST_PATH = path.resolve(__dirname, "tool-ui-literal-allowlist.json");

function allowlist(): string[] {
  return (JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as { values: string[] }).values;
}

/** An entry is either bare text (any file) or `repo/relative/path::text` (that file only). */
function isAllowed(allow: Set<string>, h: { file: string; text: string }): boolean {
  return allow.has(h.text) || allow.has(`${h.file}::${h.text}`);
}

describe("web UI literal drift (#906, #909)", () => {
  it("renders no unallowlisted English literals in apps/web/src", () => {
    const allow = new Set(allowlist());
    const offenders = scanToolUiLiterals(WEB_SRC).filter((h) => !isAllowed(allow, h));
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
    const hits = scanToolUiLiterals(WEB_SRC);
    const present = new Set(hits.flatMap((h) => [h.text, `${h.file}::${h.text}`]));
    const stale = allowlist().filter((v) => !present.has(v));
    expect(stale, `Allowlist entries with no remaining occurrence: ${stale.join(", ")}`).toEqual(
      [],
    );
  });
});
