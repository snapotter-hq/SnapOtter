import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { computeHmac } from "./audit-integrity.js";
import { deriveAuditHmacKey } from "./encryption.js";

const MAX_AUDIT_INPUT_LENGTH = 200;

/**
 * Check whether tool operation audit logging is enabled.
 *
 * Two paths can enable it:
 *   1. The `auditToolOperations` admin setting is explicitly "true".
 *   2. An active enterprise license enables the `audit_export` feature.
 *
 * Returns false on any error so a broken check never blocks tool execution.
 */
export async function isToolAuditEnabled(): Promise<boolean> {
  try {
    const result = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, "auditToolOperations"))
      .limit(1);
    if (result.length > 0 && result[0].value === "true") return true;
  } catch {
    // fall through to enterprise check
  }

  try {
    const enterprise = await import("@snapotter/enterprise");
    return enterprise.isFeatureEnabled("audit_export");
  } catch {
    return false;
  }
}

const AUDIT_STRIP_RE = /[<>&"'\r\n\0\x85\u2028\u2029]/g;

export function sanitizeAuditInput(raw: string): string {
  return raw.replace(AUDIT_STRIP_RE, "").slice(0, MAX_AUDIT_INPUT_LENGTH) || "(empty)";
}

/**
 * Emit a structured audit log entry for security-relevant events.
 *
 * Dual-writes: structured stdout log (for aggregators) + DB row.
 */
export async function auditLog(
  logger: FastifyBaseLogger,
  event: string,
  details: Record<string, unknown> = {},
  ip: string | null = null,
  requestId: string | null = null,
): Promise<void> {
  logger.info({ audit: true, event, ip, requestId, ...details }, `[AUDIT] ${event}`);

  const actorId = (details.userId as string) ?? (details.adminId as string) ?? null;
  const actorUsername = (details.username as string) ?? (details.newUsername as string) ?? "system";
  const targetId = (details.targetUserId as string) ?? (details.keyId as string) ?? null;
  const targetType = deriveTargetType(event);

  const id = randomUUID();
  try {
    await db.insert(schema.auditLog).values({
      id,
      actorId,
      actorUsername,
      action: event,
      targetType,
      targetId,
      details,
      ipAddress: ip,
      requestId,
    });
  } catch {
    logger.warn({ event }, "Failed to write audit log to DB");
    return;
  }

  // Compute HMAC for tamper-resistant mode
  if (env.DATA_ENCRYPTION_KEY) {
    try {
      const tamperResult = await db
        .select({ value: schema.settings.value })
        .from(schema.settings)
        .where(eq(schema.settings.key, "tamperResistantAudit"))
        .limit(1);

      if (tamperResult.length > 0 && tamperResult[0].value === "true") {
        const hmacKey = await deriveAuditHmacKey(env.DATA_ENCRYPTION_KEY);
        const rowData = {
          actorId,
          actorUsername,
          action: event,
          targetType,
          targetId,
          details,
          ipAddress: ip,
          requestId,
        };
        const integrity = computeHmac(rowData, hmacKey);
        await db.update(schema.auditLog).set({ integrity }).where(eq(schema.auditLog.id, id));
      }
    } catch {
      logger.warn({ event }, "Failed to compute audit HMAC");
    }
  }
}

/**
 * Create a bound audit logger from a Fastify request.
 * Captures request.ip and request.id so call sites only need event + details.
 */
export function auditFromRequest(request: FastifyRequest) {
  return (event: string, details: Record<string, unknown> = {}) =>
    auditLog(request.log, event, details, request.ip, request.id);
}

function deriveTargetType(event: string): string | null {
  if (
    event.startsWith("USER_") ||
    event.startsWith("LOGIN") ||
    event.startsWith("PASSWORD") ||
    event.startsWith("OIDC_") ||
    event.startsWith("SAML_") ||
    event.startsWith("SCIM_") ||
    event.startsWith("MFA_") ||
    event === "LOGOUT"
  )
    return "user";
  if (event.startsWith("API_KEY")) return "api_key";
  if (event.startsWith("FILE")) return "file";
  if (event.startsWith("ROLE")) return "role";
  if (event === "SETTINGS_UPDATED" || event === "IP_ALLOWLIST_UPDATED") return "setting";
  if (event.startsWith("TOOL_") || event.startsWith("BATCH_") || event.startsWith("PIPELINE_"))
    return "tool";
  if (event.startsWith("LEGAL_HOLD")) return "compliance";
  if (event.startsWith("SIEM_") || event.startsWith("WEBHOOK_")) return "integration";
  return null;
}
