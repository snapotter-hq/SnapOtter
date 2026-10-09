import { describe, expect, it } from "vitest";
import { normalizePassword, passwordCandidates } from "../../../apps/api/src/lib/password-form.js";

// The Cyrillic short i and io, as one code point each (NFC) and as a base letter plus a combining mark (NFD).
const COMPOSED = "Пароль-\u0439\u0451лка1";
const DECOMPOSED = "Пароль-\u0438\u0306\u0435\u0308лка1";

describe("normalizePassword (#2056)", () => {
  it("makes the composed and decomposed spellings of one password equal", () => {
    expect(COMPOSED).not.toBe(DECOMPOSED);
    expect(normalizePassword(DECOMPOSED)).toBe(normalizePassword(COMPOSED));
  });

  it("folds compatibility variants (NFKC): fullwidth letters, circled digits, ligatures", () => {
    expect(normalizePassword("\uff30\uff41\uff53\uff53\uff11")).toBe("Pass1");
    expect(normalizePassword("a\u2461")).toBe("a2");
    expect(normalizePassword("\ufb01sh")).toBe("fish");
  });

  it("leaves ASCII alone", () => {
    expect(normalizePassword("Abcdefg1!")).toBe("Abcdefg1!");
  });

  it("is idempotent", () => {
    for (const p of [COMPOSED, DECOMPOSED, "\uff30\uff41\uff53\uff53\uff11", "\ufb01sh"]) {
      expect(normalizePassword(normalizePassword(p))).toBe(normalizePassword(p));
    }
  });
});

describe("passwordCandidates (#2056)", () => {
  it("is one candidate when the typed text is already normalized", () => {
    expect(passwordCandidates("Abcdefg1!")).toEqual(["Abcdefg1!"]);
    expect(passwordCandidates(COMPOSED)).toEqual([COMPOSED]);
  });

  it("is the normalized form first, then the text as typed, when they differ", () => {
    expect(passwordCandidates(DECOMPOSED)).toEqual([COMPOSED, DECOMPOSED]);
  });
});
