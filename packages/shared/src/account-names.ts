/**
 * The username, team-name and role-name rules the server enforces. A form checks them
 * before it sends, so it can explain a refusal in the UI language: the
 * server's 400 for them names no rule, only English text (#1445).
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(username)
  );
}

/** Team names are stored trimmed. */
export const TEAM_NAME_MAX_LENGTH = 50;

/** Role names are compared and stored trimmed and lowercased. */
export const ROLE_NAME_MIN_LENGTH = 2;
export const ROLE_NAME_MAX_LENGTH = 30;
export const ROLE_NAME_PATTERN = /^[a-z0-9_-]+$/;

export function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase();
}

export function isValidRoleName(name: string): boolean {
  const normalized = normalizeRoleName(name);
  return (
    normalized.length >= ROLE_NAME_MIN_LENGTH &&
    normalized.length <= ROLE_NAME_MAX_LENGTH &&
    ROLE_NAME_PATTERN.test(normalized)
  );
}
