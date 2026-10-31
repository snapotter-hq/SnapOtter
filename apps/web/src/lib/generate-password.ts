const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
// The server policy can require a special character (passwordRequireSpecial), so
// always include one. These all satisfy its check in apps/api/src/plugins/auth.ts.
const SPECIAL = "!@#$%&*()-_=+";
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

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

function secureRandom(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function pick(chars: string): string {
  return chars[secureRandom(chars.length)];
}

export function generatePassword(length = DEFAULT_LENGTH): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
