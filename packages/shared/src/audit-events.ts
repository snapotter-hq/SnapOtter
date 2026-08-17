export const CORE_AUDIT_EVENTS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "USER_CREATED",
  "USER_DELETED",
  "USER_UPDATED",
  "FILE_UPLOADED",
  "FILE_DELETED",
  "API_KEY_CREATED",
  "API_KEY_DELETED",
  "API_KEY_AUTH_FAILED",
  "ROLE_CREATED",
  "ROLE_UPDATED",
  "ROLE_DELETED",
  "SETTINGS_UPDATED",
  "OIDC_LOGIN_SUCCESS",
  "OIDC_USER_CREATED",
  "OIDC_USER_LINKED",
  "OIDC_LOGIN_FAILED",
  "TOOL_EXECUTED",
  "BATCH_EXECUTED",
  "PIPELINE_EXECUTED",
] as const;

export type CoreAuditEvent = (typeof CORE_AUDIT_EVENTS)[number];

export const ALL_AUDIT_EVENTS = [...CORE_AUDIT_EVENTS] as string[];

export function registerAuditEvents(events: string[]) {
  for (const e of events) {
    if (!ALL_AUDIT_EVENTS.includes(e)) {
      ALL_AUDIT_EVENTS.push(e);
    }
  }
}
