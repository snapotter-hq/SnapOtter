// scripts/i18n/lib/hash.mjs
import { createHash } from "node:crypto";

/**
 * Stable 12-char hex hash of a source string.
 * CRLF is normalized to LF so line-ending changes never trigger re-translation.
 * @param {string} text
 * @returns {string}
 */
export function hash(text) {
  const normalized = String(text).replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 12);
}
