// scripts/i18n/adapters/landing-seo.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadToolStrings as sharedLoadToolStrings } from "../lib/shared-i18n.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = join(__dirname, "../../../apps/landing/src/data/i18n");

// Prose fields translated per source. Tool name/description are intentionally absent:
// they come from shared i18n at render time. Slugs, urls, dates, booleans stay as-is.
const SEO_STRING_FIELDS = ["searchTitle", "h1", "longDescription"];
const SEO_ARRAY_FIELDS = ["useCases", "features"];
const ALT_STRING_FIELDS = ["pageTitle", "h1", "metaDescription", "intro", "breadth"];

function pushIfString(units, id, value) {
  if (typeof value === "string" && value.trim().length > 0) {
    units.push({ id, sourceText: value, kind: "text" });
  }
}

function extractToolSeo(units, toolSeo) {
  for (const [toolId, seo] of Object.entries(toolSeo)) {
    const base = `seo:${toolId}`;
    for (const field of SEO_STRING_FIELDS) pushIfString(units, `${base}:${field}`, seo[field]);
    for (const field of SEO_ARRAY_FIELDS) {
      const arr = Array.isArray(seo[field]) ? seo[field] : [];
      arr.forEach((v, i) => pushIfString(units, `${base}:${field}.${i}`, v));
    }
    const faqs = Array.isArray(seo.faqs) ? seo.faqs : [];
    faqs.forEach((faq, i) => {
      pushIfString(units, `${base}:faqs.${i}.q`, faq.q);
      pushIfString(units, `${base}:faqs.${i}.a`, faq.a);
    });
  }
}

function extractAlternatives(units, alternatives) {
  for (const alt of alternatives) {
    const base = `alt:${alt.slug}`;
    for (const field of ALT_STRING_FIELDS) pushIfString(units, `${base}:${field}`, alt[field]);
    const rows = Array.isArray(alt.rows) ? alt.rows : [];
    rows.forEach((row, i) => {
      pushIfString(units, `${base}:rows.${i}.feature`, row.feature);
      pushIfString(units, `${base}:rows.${i}.snapotter`, row.snapotter);
      pushIfString(units, `${base}:rows.${i}.competitor`, row.competitor);
    });
    const faqs = Array.isArray(alt.faqs) ? alt.faqs : [];
    faqs.forEach((faq, i) => {
      pushIfString(units, `${base}:faqs.${i}.q`, faq.q);
      pushIfString(units, `${base}:faqs.${i}.a`, faq.a);
    });
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function fileFor(dir, source, locale) {
  const base = source === "alt" ? "alternatives" : "tool-seo";
  return join(dir, `${base}.${locale}.json`);
}

function toStored(record) {
  const out = new Map();
  for (const [id, e] of Object.entries(record ?? {})) {
    out.set(id, {
      text: e.text ?? "",
      sourceHash: e._sourceHash ?? "",
      provenance: e.provenance ?? "machine",
      outputHash: e.outputHash ?? "",
      stale: Boolean(e.stale),
    });
  }
  return out;
}

function toRecord(entries, wantSource) {
  const record = {};
  for (const id of [...entries.keys()].sort()) {
    const source = id.startsWith("alt:") ? "alt" : "seo";
    if (source !== wantSource) continue;
    const e = entries.get(id);
    record[id] = {
      text: e.text,
      _sourceHash: e.sourceHash,
      provenance: e.provenance,
      outputHash: e.outputHash,
      stale: Boolean(e.stale),
    };
  }
  return record;
}

/**
 * Build the landing SEO data adapter.
 * @param {{
 *   dir?: string,
 *   toolSeo?: Record<string, any>,
 *   alternatives?: any[],
 *   loadToolStrings?: (locale: string) => Promise<Record<string, { name: string, description: string }>>,
 * }} [opts]
 */
export function makeLandingSeoAdapter(opts = {}) {
  const dir = opts.dir ?? DEFAULT_OUT_DIR;
  const loadToolStrings = opts.loadToolStrings ?? sharedLoadToolStrings;
  return {
    name: "landing-seo",

    async extract() {
      // Reuse app translations for tool name/description (proves they are covered,
      // and lets a future extension surface them without translating here).
      await loadToolStrings("en");
      const toolSeo =
        opts.toolSeo ?? (await import("../../../apps/landing/src/data/tool-seo.ts")).TOOL_SEO;
      const alternatives =
        opts.alternatives ??
        (await import("../../../apps/landing/src/data/alternatives.ts")).ALTERNATIVES;
      const units = [];
      extractToolSeo(units, toolSeo);
      extractAlternatives(units, alternatives);
      return units;
    },

    async load(locale) {
      const seo = await readJson(fileFor(dir, "seo", locale));
      const alt = await readJson(fileFor(dir, "alt", locale));
      const merged = new Map();
      for (const [id, e] of toStored(seo)) merged.set(id, e);
      for (const [id, e] of toStored(alt)) merged.set(id, e);
      return merged;
    },

    async write(locale, entries) {
      const seoRecord = toRecord(entries, "seo");
      const altRecord = toRecord(entries, "alt");
      await writeFile(fileFor(dir, "seo", locale), `${JSON.stringify(seoRecord, null, 2)}\n`);
      await writeFile(fileFor(dir, "alt", locale), `${JSON.stringify(altRecord, null, 2)}\n`);
    },
  };
}

export const adapter = makeLandingSeoAdapter();
