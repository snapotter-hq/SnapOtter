// scripts/i18n/adapters/landing-seo.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = join(__dirname, "../../../apps/landing/src/data/i18n");

// Only the alternatives pages are localized. Tool-detail pages are English-only
// (thin-content SEO risk), so their tool-seo prose is never rendered in a locale
// and is intentionally not extracted here.
const ALT_STRING_FIELDS = ["pageTitle", "h1", "metaDescription", "intro", "breadth"];

function pushIfString(units, id, value) {
  if (typeof value === "string" && value.trim().length > 0) {
    units.push({ id, sourceText: value, kind: "text" });
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

function altFileFor(dir, locale) {
  return join(dir, `alternatives.${locale}.json`);
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

function toRecord(entries) {
  const record = {};
  for (const id of [...entries.keys()].sort()) {
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
 * Build the landing SEO data adapter (alternatives pages only).
 * @param {{
 *   dir?: string,
 *   alternatives?: any[],
 * }} [opts]
 */
export function makeLandingSeoAdapter(opts = {}) {
  const dir = opts.dir ?? DEFAULT_OUT_DIR;
  return {
    name: "landing-seo",

    async extract() {
      const alternatives =
        opts.alternatives ??
        (await import("../../../apps/landing/src/data/alternatives.ts")).ALTERNATIVES;
      const units = [];
      extractAlternatives(units, alternatives);
      return units;
    },

    async load(locale) {
      const alt = await readJson(altFileFor(dir, locale));
      return toStored(alt);
    },

    async write(locale, entries) {
      const altRecord = toRecord(entries);
      await mkdir(dir, { recursive: true });
      await writeFile(altFileFor(dir, locale), `${JSON.stringify(altRecord, null, 2)}\n`);
    },
  };
}

export const adapter = makeLandingSeoAdapter();
