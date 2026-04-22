import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { db, schema } from "../db/index.js";

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
  | "API_KEY_DELETED"
  | "ROLE_CREATED"
  | "ROLE_UPDATED"
  | "ROLE_DELETED"
  | "SETTINGS_UPDATED";

/**
 * Emit a structured audit log entry for security-relevant events.
 *
 * Dual-writes: structured stdout log (for aggregators) + SQLite row.
 */
export function auditLog(
  logger: FastifyBaseLogger,
  event: AuditEvent,
  details: Record<string, unknown> = {},
): void {
  logger.info({ audit: true, event, ...details }, `[AUDIT] ${event}`);

  const actorId = (details.userId as string) ?? (details.adminId as string) ?? null;
  const actorUsername = (details.username as string) ?? (details.newUsername as string) ?? "system";
  const targetId = (details.targetUserId as string) ?? (details.keyId as string) ?? null;
  const targetType = deriveTargetType(event);

  try {
    db.insert(schema.auditLog)
      .values({
        id: randomUUID(),
        actorId,
        actorUsername,
        action: event,
        targetType,
        targetId,
        details: JSON.stringify(details),
        ipAddress: null,
      })
      .run();
  } catch {
    logger.warn({ event }, "Failed to write audit log to DB");
  }
}

function deriveTargetType(event: AuditEvent): string | null {
  if (
    event.startsWith("USER_") ||
    event.startsWith("LOGIN") ||
    event.startsWith("PASSWORD") ||
    event === "LOGOUT"
  )
    return "user";
  if (event.startsWith("API_KEY")) return "api_key";
  if (event.startsWith("FILE")) return "file";
  if (event.startsWith("ROLE")) return "role";
  if (event === "SETTINGS_UPDATED") return "setting";
  return null;
}
