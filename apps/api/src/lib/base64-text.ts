/**
 * Text <-> Base64 for the base64 tool. Pure so the route stays a thin shell
 * and the edge cases (wrapped input, URL-safe alphabet, binary payloads) are
 * unit-testable without a server.
 */

export const ENCODED_TEXT_INVALID = "ENCODED_TEXT_INVALID";
export const DECODED_DATA_NOT_TEXT = "DECODED_DATA_NOT_TEXT";

export type Base64DecodeFailure = typeof ENCODED_TEXT_INVALID | typeof DECODED_DATA_NOT_TEXT;

export type Base64DecodeResult =
  | { ok: true; text: string }
  | { ok: false; code: Base64DecodeFailure };

export function encodeBase64Text(text: string, urlSafe: boolean): string {
  return Buffer.from(text, "utf8").toString(urlSafe ? "base64url" : "base64");
}

// Standard or URL-safe alphabet, never mixed, with optional padding.
const STANDARD = /^[A-Za-z0-9+/]*={0,2}$/;
const URL_SAFE = /^[A-Za-z0-9_-]*={0,2}$/;

/**
 * Decode Base64 back to UTF-8 text. Whitespace anywhere is dropped first, so
 * input wrapped at 76 columns (MIME, PEM bodies, email) decodes as pasted.
 *
 * Buffer.from(_, "base64") never throws: it skips characters it does not know
 * and stops at the first "=", so validation has to happen here or garbage
 * would come back as a confident, wrong answer.
 */
export function decodeBase64Text(input: string): Base64DecodeResult {
  const compact = input.replace(/\s+/g, "");
  if (!STANDARD.test(compact) && !URL_SAFE.test(compact)) {
    return { ok: false, code: ENCODED_TEXT_INVALID };
  }
  const body = compact.replace(/=+$/, "");
  // A single leftover character carries 6 bits, less than one byte.
  if (body.length % 4 === 1) return { ok: false, code: ENCODED_TEXT_INVALID };
  if (compact.length > body.length && compact.length % 4 !== 0) {
    return { ok: false, code: ENCODED_TEXT_INVALID };
  }

  const bytes = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, code: DECODED_DATA_NOT_TEXT };
  }
}
