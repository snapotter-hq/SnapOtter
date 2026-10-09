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
 * The longest password the server accepts, in UTF-16 code units like the
 * request schemas. Anything the policy lets a user set has to pass the login
 * schema's cap too, so both use this one constant. The cap bounds the
 * normalizing and rule checks a password goes through before it is hashed.
 */
export const PASSWORD_MAX_LENGTH = 1024;

export type PasswordRule = (typeof PASSWORD_RULES)[number];

export function isPasswordRule(value: unknown): value is PasswordRule {
  return typeof value === "string" && (PASSWORD_RULES as readonly string[]).includes(value);
}
