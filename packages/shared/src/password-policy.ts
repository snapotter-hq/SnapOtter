/**
 * The password-policy rules the server enforces, named in a weak-password
 * 400 as `rule` so a client can word the failure in its own language
 * (#1446). One list for both sides: a rule added to the server without a
 * client message is a type error, not a silent generic failure.
 */
export const PASSWORD_RULES = [
  "minLength",
  "uppercase",
  "lowercase",
  "digit",
  "special",
  "controlCharacter",
  "maxLength",
  "invalidCharacter",
] as const;

/**
 * The longest password the server accepts, measured in Unicode code points
 * after NFKC normalization.
 */
export const PASSWORD_MAX_LENGTH = 1024;

/**
 * The body-size guard on the login and password-set schemas. This is a limit
 * on UTF-16 code units (the string's .length) to protect the normalization
 * step, set high enough that 1024 code points can never exceed it even with
 * extreme modifiers.
 */
export const PASSWORD_MAX_CODE_UNITS = 4096;

export type PasswordRule = (typeof PASSWORD_RULES)[number];

export function isPasswordRule(value: unknown): value is PasswordRule {
  return typeof value === "string" && (PASSWORD_RULES as readonly string[]).includes(value);
}

/**
 * Canonical settings keys for the four boolean password-complexity switches.
 * `passwordRequireNumber` is the 2.0/2.1 alias for `passwordRequireDigit`.
 */
export const PASSWORD_RULE_SETTING_KEYS = [
  "passwordRequireUppercase",
  "passwordRequireLowercase",
  "passwordRequireDigit",
  "passwordRequireSpecial",
] as const;

export type PasswordRuleSettingKey =
  | (typeof PASSWORD_RULE_SETTING_KEYS)[number]
  | "passwordRequireNumber";

export function isPasswordRuleSettingKey(key: string): key is PasswordRuleSettingKey {
  return (
    key === "passwordRequireUppercase" ||
    key === "passwordRequireLowercase" ||
    key === "passwordRequireDigit" ||
    key === "passwordRequireNumber" ||
    key === "passwordRequireSpecial"
  );
}

/**
 * The minimum password length when the admin has not set one. New installs
 * accept any non-empty password; installs that existed before this default
 * changed had the old minimum of 8 pinned by migration 0014.
 */
export const DEFAULT_PASSWORD_MIN_LENGTH = 1;

/**
 * Whether a stored boolean password-rule setting is enabled (#2026, #2036).
 *
 * With no row, every rule is off: new installs accept any non-empty password.
 * A stored uppercase, lowercase or digit rule is off only when it is `"false"`,
 * so a non-canonical value (`"TRUE"`, `"1"`) still fails closed and matches the
 * Security tab switch. Migration 0014 stored `"true"` for those three on
 * installs that already had users, so they keep enforcing what they always
 * did. The special-character rule is enabled only when stored as `"true"`.
 */
export function isPasswordRuleEnabled(
  key: PasswordRuleSettingKey,
  storedValue: string | null | undefined,
): boolean {
  if (key === "passwordRequireSpecial") {
    return storedValue === "true";
  }
  return storedValue != null && storedValue !== "false";
}

/**
 * Normalize a stored or imported password-rule setting value to `"true"` or
 * `"false"` using the same rule enforcement and the Security tab apply (#2036).
 */
export function normalizePasswordRuleSetting(
  key: PasswordRuleSettingKey,
  storedValue: string | null | undefined,
): "true" | "false" {
  return isPasswordRuleEnabled(key, storedValue) ? "true" : "false";
}
