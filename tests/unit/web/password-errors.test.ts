/**
 * passwordErrorMessage() answers only what it recognizes and returns null
 * for the rest, so each caller applies its own generic copy (#1446). It
 * never passes the server's English `error` through.
 */

import { en, PASSWORD_RULES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { passwordErrorMessage } from "@/lib/password-errors";

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
