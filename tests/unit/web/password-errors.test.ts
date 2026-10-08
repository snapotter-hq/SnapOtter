/**
 * passwordErrorMessage() answers only what it recognizes and returns null
 * for the rest, so each caller applies its own generic copy (#1446). It
 * never passes the server's English `error` through.
 */

import { en, PASSWORD_RULES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { passwordErrorMessage, passwordErrorMessages } from "@/lib/password-errors";

describe("passwordErrorMessage (#1446)", () => {
  it("has a message for every rule the server can name", () => {
    for (const rule of PASSWORD_RULES) {
      const message = passwordErrorMessage(en, 400, {
        code: "VALIDATION_ERROR",
        rule,
        minLength: 10,
      });
      expect(message, rule).toEqual(expect.any(String));
    }
    expect(
      passwordErrorMessage(en, 400, { code: "VALIDATION_ERROR", rule: "minLength", minLength: 10 }),
    ).toBe(en.errors.passwordTooShort.replace("{minLength}", "10"));
  });

  it.each([
    ["a validation error with no rule (a failed schema parse)", 400, { code: "VALIDATION_ERROR" }],
    ["a rule this client doesn't know", 400, { code: "VALIDATION_ERROR", rule: "breached" }],
    ["the length rule without a number", 400, { code: "VALIDATION_ERROR", rule: "minLength" }],
    ["an expired session", 401, { code: "AUTH_REQUIRED" }],
    ["a missing user", 404, { code: "NOT_FOUND" }],
    ["a server error", 500, {}],
  ])("returns null for %s", (_label, status, body) => {
    expect(passwordErrorMessage(en, status, { ...body, error: "Server English" } as never)).toBe(
      null,
    );
  });

  it("maps the codes it knows", () => {
    expect(passwordErrorMessage(en, 401, { code: "INVALID_PASSWORD" })).toBe(
      en.settings.security.currentPasswordIncorrect,
    );
    expect(passwordErrorMessage(en, 400, { code: "OIDC_NO_PASSWORD" })).toBe(
      en.auth.passwordManagedByProvider,
    );
    expect(passwordErrorMessage(en, 429, {})).toBe(en.errors.tooManyRequests);
  });
});

describe("passwordErrorMessages (#1569)", () => {
  it("gives one message per rule the server lists, in order", () => {
    expect(
      passwordErrorMessages(en, 400, {
        code: "VALIDATION_ERROR",
        rule: "minLength",
        rules: ["minLength", "digit", "special"],
        minLength: 12,
      }),
    ).toEqual([
      en.errors.passwordTooShort.replace("{minLength}", "12"),
      en.errors.passwordNeedsDigit,
      en.errors.passwordNeedsSpecial,
    ]);
  });

  it("skips rules this client doesn't know and the length rule without a number", () => {
    expect(
      passwordErrorMessages(en, 400, {
        code: "VALIDATION_ERROR",
        rules: ["breached", "minLength", "uppercase"],
      }),
    ).toEqual([en.errors.passwordNeedsUppercase]);
  });

  it("falls back to the single-rule message when the list is missing or unusable", () => {
    const single = { code: "VALIDATION_ERROR", rule: "lowercase" };
    expect(passwordErrorMessages(en, 400, single)).toEqual([en.errors.passwordNeedsLowercase]);
    expect(passwordErrorMessages(en, 400, { ...single, rules: [] })).toEqual([
      en.errors.passwordNeedsLowercase,
    ]);
    expect(passwordErrorMessages(en, 400, { ...single, rules: "digit" })).toEqual([
      en.errors.passwordNeedsLowercase,
    ]);
  });

  it("wraps the other messages it knows and is empty for what it doesn't", () => {
    expect(passwordErrorMessages(en, 429, {})).toEqual([en.errors.tooManyRequests]);
    expect(passwordErrorMessages(en, 500, {})).toEqual([]);
  });
});
