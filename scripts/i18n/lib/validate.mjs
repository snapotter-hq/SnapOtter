// scripts/i18n/lib/validate.mjs
import { countStructures, TOKEN_RE } from "./mask.mjs";

/**
 * Assert that the translated text preserved the source's markdown structure.
 * Runs on the FINAL (restored) translation, so no mask tokens should remain.
 * @param {string} source
 * @param {string} translated
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validate(source, translated) {
  const errors = [];
  const a = countStructures(source);
  const b = countStructures(translated);
  for (const key of /** @type {const} */ (["fences", "inlineCode", "links", "placeholders"])) {
    if (a[key] !== b[key]) errors.push(`${key} count changed: ${a[key]} -> ${b[key]}`);
  }
  TOKEN_RE.lastIndex = 0;
  if (TOKEN_RE.test(translated)) errors.push("unrestored mask token remained in output");
  return { ok: errors.length === 0, errors };
}
