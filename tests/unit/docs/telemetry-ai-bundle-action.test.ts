// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { AI_INSTALL_ERROR_KINDS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { ALLOWED } from "../../../apps/api/src/lib/analytics-allowlist.js";

/**
 * The published telemetry pages promise what an instance sends. When #4895
 * added install_started, install_failed and error_kind to ai_bundle_action,
 * the docs kept the old field list (#4926). These checks tie the documented
 * ai_bundle_action fields to the allowlist, the action literals the API emits,
 * and the closed error_kind list.
 */

const ROOT = path.resolve(__dirname, "../../..");
const FEATURES_ROUTE = path.join(ROOT, "apps/api/src/routes/features.ts");
const DOCS = path.join(ROOT, "apps/docs");
const AI_BUNDLE_ACTION_LITERAL = /AI_BUNDLE_ACTION,\s*\{[^}]*?\baction:\s*"([a-z_]+)"/g;

function emittedActions(): string[] {
  const source = readFileSync(FEATURES_ROUTE, "utf8");
  const matches = [...source.matchAll(AI_BUNDLE_ACTION_LITERAL)];
  // A site the regex can't read (a computed action, a `}` before `action:`)
  // would otherwise drop out and let an undocumented action pass.
  const sites = source.split("AI_BUNDLE_ACTION,").length - 1;
  if (matches.length !== sites) {
    throw new Error(
      `read ${matches.length} of ${sites} AI_BUNDLE_ACTION emit sites in features.ts`,
    );
  }
  return [...new Set(matches.map((match) => match[1]))].sort();
}

function missingCodeSpans(text: string, values: readonly string[]): string[] {
  return values.filter((value) => !text.includes(`\`${value}\``));
}

function guidePages(): string[] {
  const locales = readdirSync(DOCS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(DOCS, entry.name, "guide/telemetry.md"))
    .filter((file) => existsSync(file));
  return [path.join(DOCS, "guide/telemetry.md"), ...locales];
}

function aiBundleActionLine(file: string): string {
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("- ai_bundle_action"));
  if (!line) throw new Error(`${path.relative(ROOT, file)} has no ai_bundle_action bullet`);
  return line;
}

describe("ai_bundle_action telemetry docs", () => {
  it("finds the emitted actions, including the #4895 ones", () => {
    expect(emittedActions()).toEqual(expect.arrayContaining(["install_started", "install_failed"]));
  });

  it("TELEMETRY.md lists every allow-listed property, action and error_kind", () => {
    // TELEMETRY.md is stripped from the shipped container image (.dockerignore).
    if (existsSync("/.dockerenv")) return;
    const row = readFileSync(path.join(ROOT, "TELEMETRY.md"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("| `ai_bundle_action` |"));
    expect(row).toBeDefined();
    // app_version is stamped on every server event and documented once above the table.
    const properties = [...ALLOWED.ai_bundle_action].filter((key) => key !== "app_version");
    expect(missingCodeSpans(row ?? "", properties)).toEqual([]);
    expect(missingCodeSpans(row ?? "", emittedActions())).toEqual([]);
    expect(missingCodeSpans(row ?? "", AI_INSTALL_ERROR_KINDS)).toEqual([]);
  });

  it("every telemetry guide names each action and error_kind", () => {
    const pages = guidePages();
    expect(pages).toHaveLength(21);
    const gaps = pages.flatMap((file) => {
      const line = aiBundleActionLine(file);
      const missing = [
        ...missingCodeSpans(line, emittedActions()),
        ...missingCodeSpans(line, AI_INSTALL_ERROR_KINDS),
      ];
      return missing.length ? [`${path.relative(ROOT, file)}: ${missing.join(", ")}`] : [];
    });
    expect(gaps).toEqual([]);
  });
});
