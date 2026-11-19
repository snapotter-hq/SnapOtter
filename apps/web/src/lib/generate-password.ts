import { PASSPHRASE_WORDS } from "./passphrase-words.js";

// Generated passwords are word passphrases (Maple-Otter-River-Candle-47) because
// people forgot random 20-character strings right after setting them. Capitalised
// words give the uppercase and lowercase rules, the number gives the digit rule,
// and "-" satisfies the special-character rule in apps/api/src/plugins/auth.ts.
// Digits skip 0 and 1, which read as O and l.
const DIGITS = "23456789";
const SEPARATOR = "-";
// Four words from ~1,250 plus two digits is about 47 bits, which scrypt hashing
// and login rate limiting put far out of reach of guessing.
const MIN_WORDS = 4;

// 20 clears the default minimum with room to spare. The forced change-password
// page can't read passwordMinLength (the user has no access to /v1/settings yet),
// so it starts here and learns the minimum from the server's refusal (#2027).
const DEFAULT_LENGTH = 20;

/**
 * How long a generated password must be to meet a server minimum, which the
 * admin can set anywhere from 1 to 128. Never shorter than the default, and
 * the default when the minimum is unknown or unreadable.
 */
export function passwordLengthFor(minLength: unknown): number {
  const min = Number(minLength);
  return Number.isFinite(min) ? Math.max(DEFAULT_LENGTH, Math.ceil(min)) : DEFAULT_LENGTH;
}

/** A uniform integer in [0, max), rejecting the values that would bias the modulo. */
function secureRandom(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const array = new Uint32Array(1);
  do {
    crypto.getRandomValues(array);
  } while (array[0] >= limit);
  return array[0] % max;
}

function pick<T>(items: ArrayLike<T>): T {
  return items[secureRandom(items.length)];
}

function capitalise(word: string): string {
  return word[0].toUpperCase() + word.slice(1);
}

/**
 * A passphrase of at least `minLength` characters: capitalised words joined by
 * hyphens, ending in a two-digit number. Words are added past the first four
 * until the minimum is met.
 */
export function generatePassword(minLength = DEFAULT_LENGTH): string {
  const words: string[] = [];
  const number = pick(DIGITS) + pick(DIGITS);
  const length = () => words.join(SEPARATOR).length + SEPARATOR.length + number.length;
  while (words.length < MIN_WORDS || length() < minLength) {
    words.push(capitalise(pick(PASSPHRASE_WORDS)));
  }
  return [...words, number].join(SEPARATOR);
}
