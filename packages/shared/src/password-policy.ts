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
