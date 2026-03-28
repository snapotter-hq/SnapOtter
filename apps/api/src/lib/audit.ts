import type { FastifyBaseLogger } from "fastify";

type AuditEvent =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "USER_CREATED"
  | "USER_DELETED"
  | "USER_UPDATED"
  | "FILE_UPLOADED"
  | "FILE_DELETED"
  | "API_KEY_CREATED"
  | "API_KEY_DELETED";

/**
 * Emit a structured audit log entry for security-relevant events.
 *
 * Logs are written at INFO level with `audit: true` so they can be
 * filtered by log aggregators (e.g. `jq 'select(.audit)'`).
 */
export function auditLog(
  logger: FastifyBaseLogger,
  event: AuditEvent,
  details: Record<string, unknown> = {},
): void {
  logger.info({ audit: true, event, ...details }, `[AUDIT] ${event}`);
}
