import type { TranslationKeys } from "@snapotter/shared";
import { format } from "@/lib/format";

/** The parts of a failed password-change response the message depends on. */
export interface PasswordErrorBody {
  code?: unknown;
  rule?: unknown;
  minLength?: unknown;
}

/**
 * What to tell the user when a password change (or a new password) is
 * refused, in their language (#1446). Decided by status, code and the policy
 * rule the server names, never by the server's English `error` text. Anything
 * unrecognized falls back to `fallback`.
 */
export function passwordErrorMessage(
  t: TranslationKeys,
  status: number,
  body: PasswordErrorBody,
  fallback: string,
): string {
  if (status === 429) return t.errors.tooManyRequests;
  // By code, not by 401: an expired session is a 401 too (AUTH_REQUIRED).
  if (body.code === "INVALID_PASSWORD") return t.settings.security.currentPasswordIncorrect;
  if (body.code === "OIDC_NO_PASSWORD") return t.auth.passwordManagedByProvider;
  if (body.code === "VALIDATION_ERROR") {
    switch (body.rule) {
      case "minLength":
        return typeof body.minLength === "number"
          ? format(t.errors.passwordTooShort, { minLength: body.minLength })
          : fallback;
      case "uppercase":
        return t.errors.passwordNeedsUppercase;
      case "lowercase":
        return t.errors.passwordNeedsLowercase;
      case "digit":
        return t.errors.passwordNeedsDigit;
      case "special":
        return t.errors.passwordNeedsSpecial;
    }
  }
  return fallback;
}
