/**
 * The synthetic user an AUTH_ENABLED=false instance seeds. It stays in the users
 * table after auth is turned on (#2334, #2461) because pipelines, user_files, and
 * user_preferences reference it by id, and deleting the row cascades them away.
 */
export const ANONYMOUS_USER_ID = "anonymous";

/**
 * True for that leftover row. Admin, compliance, and SCIM routes treat it as
 * absent: it has no real owner to mutate, export, purge, or put on legal hold.
 */
export function isAnonymousUserId(id: string): boolean {
  return id === ANONYMOUS_USER_ID;
}
