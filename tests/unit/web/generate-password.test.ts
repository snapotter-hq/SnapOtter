import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generatePassword,
  passwordLengthFor,
} from "../../../apps/web/src/lib/generate-password.js";
import { PASSPHRASE_WORDS } from "../../../apps/web/src/lib/passphrase-words.js";

// The server's special-character rule in apps/api/src/plugins/auth.ts (#1568).
const SERVER_SPECIAL = /[\p{P}\p{S}\p{Zs}]/u;
// Capitalised words joined by hyphens, then a two-digit number with no 0 or 1.
const PASSPHRASE = /^(?:[A-Z][a-z]{3,6}-){4,}[2-9]{2}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

// The Generate buttons size the password to the server's passwordMinLength
// (1 to 128), which can exceed the default of 20 (#2027).
describe("passwordLengthFor", () => {
  it("keeps the default when the minimum is lower or unknown", () => {
    expect(passwordLengthFor(8)).toBe(20);
    expect(passwordLengthFor(20)).toBe(20);
    expect(passwordLengthFor(undefined)).toBe(20);
    expect(passwordLengthFor(null)).toBe(20);
    expect(passwordLengthFor("not a number")).toBe(20);
    expect(passwordLengthFor(Number.NaN)).toBe(20);
  });

  it("meets a minimum above the default, including one read from a string setting", () => {
    expect(passwordLengthFor(21)).toBe(21);
    expect(passwordLengthFor(24)).toBe(24);
    expect(passwordLengthFor("128")).toBe(128);
  });

  it("rounds a fractional minimum up so the password still meets it", () => {
    expect(passwordLengthFor(24.2)).toBe(25);
  });
});

describe("generatePassword", () => {
  it("makes a passphrase that satisfies upper, lower, digit and special-character rules", () => {
    for (let i = 0; i < 500; i++) {
      const pw = generatePassword();
      expect(pw).toMatch(PASSPHRASE);
      expect(pw.length).toBeGreaterThanOrEqual(20);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(SERVER_SPECIAL);
    }
  });

  it("uses four words by default and adds words to reach a longer minimum", () => {
    expect(generatePassword().split("-")).toHaveLength(5);
    for (const min of [40, 64, 128]) {
      const pw = generatePassword(passwordLengthFor(min));
      expect(pw.length).toBeGreaterThanOrEqual(min);
      expect(pw).toMatch(PASSPHRASE);
    }
  });

  it("never uses characters that read as each other", () => {
    for (let i = 0; i < 500; i++) {
      expect(generatePassword()).not.toMatch(/[01]/);
    }
  });

  it("only uses words from the list, capitalised", () => {
    const words = new Set(PASSPHRASE_WORDS);
    const pw = generatePassword(64);
    for (const word of pw.split("-").slice(0, -1)) {
      expect(words.has(word.toLowerCase())).toBe(true);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(seen.size).toBe(50);
  });

  it("draws from the secure random source", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    generatePassword();
    expect(spy).toHaveBeenCalled();
  });
});

describe("PASSPHRASE_WORDS", () => {
  it("has enough unique, plain words for about 10 bits each", () => {
    expect(new Set(PASSPHRASE_WORDS).size).toBe(PASSPHRASE_WORDS.length);
    expect(PASSPHRASE_WORDS.length).toBeGreaterThanOrEqual(1024);
    for (const word of PASSPHRASE_WORDS) expect(word).toMatch(/^[a-z]{4,7}$/);
  });
});
