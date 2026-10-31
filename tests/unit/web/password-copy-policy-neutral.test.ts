import { en, loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

// The password policy is configurable (length 1 to 128, every rule optional),
// and the forced change-password page can't read it before the user has a
// usable password (#1446). Copy next to a password input therefore can't name
// a length or a rule: the server names the broken rule and the client words
// the refusal in the user's language when a password breaks the policy (#2024).
const DIGITS = /\p{Nd}/u;

describe.each(SUPPORTED_LOCALES.map((l) => l.code))("password copy in %s", (code) => {
  it("names no number, so no length or character rule", async () => {
    const t = await loadTranslations(code);
    // loadTranslations falls back to en when a locale fails to load.
    if (code !== "en") expect(t, `${code} fell back to en`).not.toBe(en);
    const copy = {
      "settings.people.newPasswordLabel": t.settings.people.newPasswordLabel,
      "changePassword.description": t.changePassword.description,
      "changePassword.newPasswordPlaceholder": t.changePassword.newPasswordPlaceholder,
    };

    for (const [key, value] of Object.entries(copy)) {
      expect(value, key).not.toMatch(DIGITS);
    }
  });
});
