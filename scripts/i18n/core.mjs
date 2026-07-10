// scripts/i18n/core.mjs
import { hash } from "./lib/hash.mjs";
import { validate } from "./lib/validate.mjs";

const CHUNK = 20; // units per write, for resumability

/**
 * @typedef {Object} StoredEntry
 * @property {string} text
 * @property {string} sourceHash
 * @property {"machine"|"human"} provenance
 * @property {string} outputHash  hash of the text the pipeline last wrote
 * @property {boolean} [stale]    source moved under a human translation
 */

/**
 * Classify units for a locale against stored translations.
 * @param {any[]} units
 * @param {Map<string, StoredEntry>} stored
 * @returns {{ pending: Array<{unit: any, srcHash: string}>, merged: Map<string, StoredEntry>, stats: { skipped: number, stale: number } }}
 */
export function collectPending(units, stored) {
  const merged = new Map(stored);
  const pending = [];
  const stats = { skipped: 0, stale: 0 };
  for (const unit of units) {
    const srcHash = hash(unit.sourceText);
    const prev = stored.get(unit.id);
    if (!prev) {
      pending.push({ unit, srcHash });
      continue;
    }
    const provenance = hash(prev.text) === prev.outputHash ? prev.provenance : "human";
    if (prev.sourceHash === srcHash) {
      merged.set(unit.id, { ...prev, provenance, stale: false });
      stats.skipped++;
      continue;
    }
    if (provenance === "human") {
      merged.set(unit.id, { ...prev, provenance, stale: true });
      stats.stale++;
      continue;
    }
    pending.push({ unit, srcHash });
  }
  return { pending, merged, stats };
}

/**
 * Translate every unit for every locale, gating on source hashes.
 * @param {{
 *   adapter: { name: string, extract: () => Promise<any[]>, load: (l: string) => Promise<Map<string, StoredEntry>>, write: (l: string, e: Map<string, StoredEntry>) => Promise<void> },
 *   locales: string[],
 *   translate: (units: any[], locale: string) => Promise<Map<string, string>>,
 *   log?: (msg: string) => void,
 * }} args
 * @returns {Promise<Record<string, { translated: number, skipped: number, stale: number, failed: number }>>}
 */
export async function runTranslation({ adapter, locales, translate, log = () => {} }) {
  const units = await adapter.extract();
  const summary = {};

  for (const locale of locales) {
    if (locale === "en") continue; // English is the source
    const stored = await adapter.load(locale);
    const { pending: todo, merged, stats: base } = collectPending(units, stored);
    const stats = { translated: 0, skipped: base.skipped, stale: base.stale, failed: 0 };

    for (let i = 0; i < todo.length; i += CHUNK) {
      const chunk = todo.slice(i, i + CHUNK);
      const result = await translate(
        chunk.map((t) => t.unit),
        locale,
      );
      for (const { unit, srcHash } of chunk) {
        const text = result.get(unit.id);
        const check =
          text == null ? { ok: false, errors: ["no output"] } : validate(unit.sourceText, text);
        if (!check.ok) {
          stats.failed++;
          log(`[${locale}] FAIL ${unit.id}: ${check.errors.join("; ")}`);
          continue;
        }
        merged.set(unit.id, {
          text,
          sourceHash: srcHash,
          provenance: "machine",
          outputHash: hash(text),
          stale: false,
        });
        stats.translated++;
      }
      await adapter.write(locale, merged); // checkpoint each chunk -> resumable
      log(`[${locale}] ${Math.min(i + CHUNK, todo.length)}/${todo.length}`);
    }

    await adapter.write(locale, merged);
    summary[locale] = stats;
  }

  return summary;
}
