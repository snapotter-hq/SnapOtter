// scripts/i18n/lib/batch.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mask, restore } from "./mask.mjs";

function pendingPath(dir, surface, locale) {
  return join(dir, `${surface}.${locale}.pending.json`);
}
function donePath(dir, surface, locale) {
  return join(dir, `${surface}.${locale}.done.json`);
}

/**
 * Write the masked source of each pending unit for subagents to translate.
 * @param {string} dir
 * @param {string} surface
 * @param {string} locale
 * @param {Array<{unit: {id: string, sourceText: string}}>} pending
 * @returns {string} the file path written
 */
export function writePending(dir, surface, locale, pending) {
  const rows = pending.map(({ unit }) => ({ id: unit.id, masked: mask(unit.sourceText).masked }));
  const path = pendingPath(dir, surface, locale);
  writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`);
  return path;
}

/**
 * Read a subagent-produced done file: { [id]: translatedMaskedText }.
 * @returns {Map<string, string>}
 */
export function readDone(dir, surface, locale) {
  const obj = JSON.parse(readFileSync(donePath(dir, surface, locale), "utf8"));
  return new Map(Object.entries(obj));
}

/**
 * Build a translate(units, locale) that reads translations from a done map,
 * re-masking each unit's source to recover its tokens and restoring them.
 * Returns null for any id absent from the done map (core records it as failed).
 * @param {Map<string, string>} doneMap
 */
export function batchResultTranslator(doneMap) {
  return async function translate(units, _locale) {
    const out = new Map();
    for (const unit of units) {
      const raw = doneMap.get(unit.id);
      if (raw == null) {
        out.set(unit.id, null);
        continue;
      }
      const { tokens } = mask(unit.sourceText);
      out.set(unit.id, restore(raw, tokens));
    }
    return out;
  };
}
