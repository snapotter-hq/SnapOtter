import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePassword } from "../../../apps/web/src/lib/generate-password.js";

// The server's special-character rule in apps/api/src/plugins/auth.ts (#1568).
const SERVER_SPECIAL = /[^\p{L}\p{M}\p{N}]/u;
const ALPHABET = /^[A-Za-z0-9!@#$%&*()\-_=+]+$/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generatePassword", () => {
  it("satisfies upper, lower, digit and special-character rules every time", () => {
    for (let i = 0; i < 500; i++) {
      const pw = generatePassword();
      expect(pw).toHaveLength(20);
      expect(pw).toMatch(ALPHABET);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(SERVER_SPECIAL);
    }
  });

  it("honours a longer requested length", () => {
    expect(generatePassword(64)).toHaveLength(64);
  });

  it("never goes below the four required classes", () => {
    expect(generatePassword(2)).toHaveLength(4);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(seen.size).toBe(50);
  });

  it("shuffles the required characters instead of leading with them", () => {
    const firstCharClasses = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const first = generatePassword()[0];
      firstCharClasses.add(
        /[A-Z]/.test(first)
          ? "upper"
          : /[a-z]/.test(first)
            ? "lower"
            : /\d/.test(first)
              ? "digit"
              : "special",
      );
    }
    expect(firstCharClasses.size).toBeGreaterThan(1);
  });

  it("draws from the secure random source", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    generatePassword();
    expect(spy).toHaveBeenCalled();
  });
});
