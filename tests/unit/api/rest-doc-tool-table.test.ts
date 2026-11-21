/**
 * The Tools Reference tables in apps/docs/api/rest.md are hand-written, and
 * every tool added after the last pass went missing from them (#5047). Pin one
 * row per catalog tool so the next new tool fails here instead of drifting.
 * Conversion presets have their own page (/tools/conversion-presets); the
 * compression presets are named in one sentence rather than ten rows.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPRESS_PRESETS } from "../../../packages/shared/src/compress-presets.js";
import { TOOLS } from "../../../packages/shared/src/constants.js";
import { CONVERSION_PRESET_BY_ID } from "../../../packages/shared/src/conversion-presets.js";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";

const DOCS_DIR = path.resolve(import.meta.dirname, "../../../apps/docs");
const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");
const COMPRESS_PRESET_IDS = COMPRESS_PRESETS.map((p) => p.id);
const TABLE_IDS = TOOLS.map((t) => t.id).filter(
  (id) => !(id in CONVERSION_PRESET_BY_ID) && !COMPRESS_PRESET_IDS.includes(id),
);

function missingFrom(relPath: string): { rows: string[]; presets: string[] } {
  const doc = readFileSync(path.join(DOCS_DIR, relPath), "utf8");
  const rows = new Set([...doc.matchAll(/^\| `([a-z0-9-]+)` \|/gm)].map((m) => m[1]));
  return {
    rows: TABLE_IDS.filter((id) => !rows.has(id)),
    presets: COMPRESS_PRESET_IDS.filter((id) => !doc.includes(`\`${id}\``)),
  };
}

describe("REST guide tool tables (#5047)", () => {
  it.each(["en", ...LOCALES])("%s rest.md names every catalog tool", (locale) => {
    const relPath = locale === "en" ? "api/rest.md" : `${locale}/api/rest.md`;
    expect(missingFrom(relPath)).toEqual({ rows: [], presets: [] });
  });
});
