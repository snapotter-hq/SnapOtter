import { isPasswordRule, type PasswordRule, type TranslationKeys } from "@snapotter/shared";
import { format } from "@/lib/format";

/** The parts of a failed password-change response the message depends on. */
export interface PasswordErrorBody {
  code?: unknown;
  rule?: unknown;
  minLength?: unknown;
}

function ruleMessage(t: TranslationKeys, rule: PasswordRule, minLength: unknown): string | null {
  switch (rule) {
    case "minLength":
      return typeof minLength === "number"
        ? format(t.errors.passwordTooShort, { minLength })
        : null;
    case "uppercase":
      return t.errors.passwordNeedsUppercase;
    case "lowercase":
      return t.errors.passwordNeedsLowercase;
    case "digit":
      return t.errors.passwordNeedsDigit;
    case "special":
      return t.errors.passwordNeedsSpecial;
    case "controlCharacter":
      return t.errors.passwordNoControlCharacters;
    default: {
      // A rule added to PASSWORD_RULES without a message fails to compile here.
      const unhandled: never = rule;
      return unhandled;
    }
  }
}

/**
 * What to tell the user when a password change (or a new password) is
 * refused, in their language (#1446), or null when the response isn't one
 * this recognizes and the caller should fall back to its own generic copy.
 * Decided by status, code and the policy rule the server names, never by the
 * server's English `error` text.
 */
export function passwordErrorMessage(
  t: TranslationKeys,
  status: number,
  body: PasswordErrorBody,
): string | null {
  if (status === 429) return t.errors.tooManyRequests;
  // By code, not by 401: an expired session is a 401 too (AUTH_REQUIRED).
  if (body.code === "INVALID_PASSWORD") return t.settings.security.currentPasswordIncorrect;
  if (body.code === "OIDC_NO_PASSWORD") return t.auth.passwordManagedByProvider;
  if (body.code === "VALIDATION_ERROR" && isPasswordRule(body.rule)) {
    return ruleMessage(t, body.rule, body.minLength);
  }
  return null;
}
