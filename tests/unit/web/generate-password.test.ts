import { describe, expect, it } from "vitest";
import { generatePassword } from "../../../apps/web/src/lib/generate-password.js";

// Mirrors the server's checks in apps/api/src/plugins/auth.ts.
const SERVER_SPECIAL = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

describe("generatePassword", () => {
  it("satisfies upper, lower, digit and special-character rules every time", () => {
    for (let i = 0; i < 500; i++) {
      const pw = generatePassword();
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(SERVER_SPECIAL);
    }
  });

  it("defaults to 20 characters, comfortably over the common minimums", () => {
    expect(generatePassword()).toHaveLength(20);
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
});
