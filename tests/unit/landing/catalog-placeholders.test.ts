import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shipped landing catalogs must keep the `{name}` placeholders their English
 * source carries (#934). A human-translated entry may drop a placeholder when
 * the sentence names the language inline instead, so for those the set only
 * has to be a subset of the English one; it may never invent a placeholder.
 */

const I18N_DIR = path.resolve(__dirname, "../../../apps/landing/src/i18n");
// Same shape as PLACEHOLDER in scripts/i18n/lib/mask.mjs.
const PLACEHOLDER = /\{\{[^{}\n]+\}\}|\{[^{}\n]+\}/g;

type Catalog = Record<string, string>;
type Meta = Record<string, { provenance?: string }>;

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(I18N_DIR, file), "utf8")) as T;
}

function placeholders(value: unknown): string[] {
  return typeof value === "string" ? [...new Set(value.match(PLACEHOLDER) ?? [])].sort() : [];
}

const en = readJson<Catalog>("en.json");
const locales = readdirSync(I18N_DIR)
  .filter((f) => /^[A-Za-z-]+\.json$/.test(f) && f !== "en.json")
  .map((f) => f.replace(/\.json$/, ""));

describe("landing catalog placeholders (#934)", () => {
  it("finds the shipped locale catalogs", () => {
    expect(locales.length).toBeGreaterThanOrEqual(20);
  });

  it.each(locales)("%s keeps the English placeholders", (locale) => {
    const catalog = readJson<Catalog>(`${locale}.json`);
    const meta = readJson<Meta>(`${locale}.meta.json`);
    const problems: string[] = [];
    for (const [key, value] of Object.entries(catalog)) {
      if (!(key in en)) continue;
      const want = placeholders(en[key]);
      const got = placeholders(value);
      const human = meta[key]?.provenance === "human";
      const ok = human ? got.every((p) => want.includes(p)) : got.join("|") === want.join("|");
      if (!ok) {
        problems.push(`${key}: want ${want.join(",") || "none"}, got ${got.join(",") || "none"}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
