import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { computeHmac } from "./audit-integrity.js";
import { deriveAuditHmacKey } from "./encryption.js";
import { isEnterpriseFeatureEnabled } from "./enterprise-feature.js";
import { logger } from "./logger.js";
import { getSettingStrict } from "./settings-helpers.js";

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
    if ((await getSettingStrict("auditToolOperations")) === "true") return true;
  } catch (err) {
    logger.warn({ err, key: "auditToolOperations" }, "Failed to read auditToolOperations setting");
  }

  return isEnterpriseFeatureEnabled("audit_export");
}

const AUDIT_STRIP_RE = /[<>&"'\r\n\0\x85\u2028\u2029]/g;

export function sanitizeAuditInput(raw: string): string {
  return raw.replace(AUDIT_STRIP_RE, "").slice(0, MAX_AUDIT_INPUT_LENGTH) || "(empty)";
}

export function extractActorId(details: Record<string, unknown>): string | null {
  return (details.userId as string) ?? (details.adminId as string) ?? null;
}

export function extractActorUsername(details: Record<string, unknown>): string {
  return (details.username as string) ?? (details.newUsername as string) ?? "system";
}

export function extractTargetId(details: Record<string, unknown>): string | null {
  return (
    (details.targetUserId as string) ??
    (details.keyId as string) ??
    (details.roleId as string) ??
    (details.targetTeamId as string) ??
    (details.teamId as string) ??
    (details.targetId as string) ??
    null
  );
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

  const actorId = extractActorId(details);
  const actorUsername = extractActorUsername(details);
  const targetId = extractTargetId(details);
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
  } catch (err) {
    logger.warn({ err, event }, "Failed to write audit log to DB");
    return;
  }

  // Compute HMAC for tamper-resistant mode
  if (env.DATA_ENCRYPTION_KEY) {
    let isTamperResistant = true;
    try {
      const rawTamper = await getSettingStrict("tamperResistantAudit");
      if (rawTamper !== undefined && rawTamper !== "false" && rawTamper !== "true") {
        logger.warn(
          { key: "tamperResistantAudit", value: rawTamper },
          "invalid boolean setting, treating tamperResistantAudit as enabled",
        );
      }
      isTamperResistant = rawTamper !== undefined && rawTamper !== "false";
    } catch (err) {
      logger.warn(
        { err, event },
        "Failed to read tamperResistantAudit setting, treating as enabled",
      );
    }

    if (isTamperResistant) {
      try {
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
      } catch (err) {
        logger.warn({ err, event }, "Failed to compute audit HMAC");
      }
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

export function deriveTargetType(event: string): string | null {
  if (event.startsWith("SCIM_GROUP")) return "team";
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
  if (
    event === "SETTINGS_UPDATED" ||
    event === "IP_ALLOWLIST_UPDATED" ||
    event.startsWith("CONFIG_")
  )
    return "setting";
  if (event.startsWith("TOOL_") || event.startsWith("BATCH_") || event.startsWith("PIPELINE_"))
    return "tool";
  if (event.startsWith("LEGAL_HOLD") || event.startsWith("GDPR_")) return "compliance";
  if (event.startsWith("SIEM_") || event.startsWith("WEBHOOK_")) return "integration";
  return null;
}
