/**
 * SIEM forwarding via the legacy siem_config settings key.
 * Phase 4 introduced a unified webhook system (webhook_destinations),
 * which also supports type: "siem" destinations. Currently these coexist --
 * a future release will migrate siem_config to the unified system.
 * For now, admins configure SIEM in either system (not both).
 *
 * Reads unforwarded audit log entries and delivers them to the configured
 * SIEM endpoint via the webhook delivery module. Implements a circuit
 * breaker (5 consecutive failures = disabled until manual reset) and a
 * cursor-based approach to avoid re-sending events.
 *
 * State keys in the settings table:
 *   - siem_last_forwarded_at: cursor (last successfully forwarded createdAt timestamp)
 *   - siem_consecutive_failures: circuit breaker counter
 */
import { SafeError } from "@snapotter/shared";
import { and, asc, eq, gte } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { decryptSettingWithRotation } from "../lib/encryption.js";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";
import { reportError } from "../lib/error-report.js";
import { logger } from "../lib/logger.js";
import { upsertSetting } from "../lib/settings-helpers.js";
import { deliverWebhook } from "../lib/webhook-delivery.js";
import { readSiemConfig } from "../routes/enterprise/siem.js";

const BATCH_LIMIT = 500;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CURSOR_KEY = "siem_last_forwarded_at";
const FAILURES_KEY = "siem_consecutive_failures";

async function readSettingValue(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, key));
  return row?.value ?? null;
}

/**
 * In-memory license check, no DB access. This job fires every 30s on every
 * instance; before this gate existed, the readSiemConfig settings read below
 * ran on unlicensed instances too and turned every DB outage into a Sentry
 * event storm (NODE-1E, July 2026).
 */
async function siemLicensed(): Promise<boolean> {
  return isEnterpriseFeatureEnabled("siem_forwarding", "worker");
}

export async function runSiemForward(): Promise<{ forwarded: number } | undefined> {
  if (!(await siemLicensed())) return;

  // 1. Read SIEM config
  const config = await readSiemConfig();
  if (!config?.enabled || !config.webhookUrl) {
    return;
  }

  // 2. Circuit breaker check
  const failureCountStr = await readSettingValue(FAILURES_KEY);
  let failureCount = 0;
  if (failureCountStr !== null) {
    const parsedFailures = /^\d+$/.test(failureCountStr)
      ? parseInt(failureCountStr, 10)
      : Number.NaN;
    if (!Number.isSafeInteger(parsedFailures)) {
      logger.warn(
        { key: FAILURES_KEY },
        "siem-forward: stored siem_consecutive_failures is not a valid non-negative integer",
      );
    } else {
      failureCount = parsedFailures;
    }
  }
  if (failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    logger.warn(
      `SIEM forwarding circuit breaker open: ${failureCount} consecutive failures. ` +
        "Reset siem_consecutive_failures to 0 in settings to re-enable.",
    );
    return;
  }

  // 3. Read cursor
  const cursor = await readSettingValue(CURSOR_KEY);

  // 4. Query audit_log for new rows (createdAt-based cursor; may re-deliver
  //    boundary events on restart, but SIEMs handle idempotent ingestion)
  let cursorDate = cursor !== null ? new Date(cursor) : null;
  if (cursorDate && !Number.isFinite(cursorDate.getTime())) {
    logger.warn(
      { key: CURSOR_KEY },
      "siem-forward: stored siem_last_forwarded_at is not a valid timestamp",
    );
    cursorDate = null;
  }
  const conditions = cursorDate ? gte(schema.auditLog.createdAt, cursorDate) : undefined;
  const rows = await db
    .select()
    .from(schema.auditLog)
    .where(conditions)
    .orderBy(asc(schema.auditLog.createdAt))
    .limit(BATCH_LIMIT);

  if (rows.length === 0) {
    return;
  }

  // 5. Decrypt auth header if encrypted
  let authHeader = config.authHeader;
  if (authHeader) {
    const decrypted = await decryptSettingWithRotation(authHeader);
    if (decrypted === null) {
      logger.error(
        "siem-forward: stored SIEM authHeader could not be decrypted; check DATA_ENCRYPTION_KEY and DATA_ENCRYPTION_KEY_PREVIOUS",
      );
      void reportError(
        new SafeError("Failed to decrypt SIEM auth header", {
          kind: "operational",
          code: "SIEM_DECRYPTION_FAILED",
        }),
        {
          source: "worker",
          pool: "system",
          subsystem: "siem-forward",
        },
      );
      return;
    }
    if (decrypted.reencrypted) {
      const rawConfig = await readSettingValue("siem_config");
      if (rawConfig !== null) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawConfig);
        } catch (err) {
          logger.warn(
            { err, key: "siem_config" },
            "siem-forward: failed to parse stored siem_config JSON during rotation writeback",
          );
        }
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed) &&
          (parsed as { authHeader?: unknown }).authHeader === authHeader
        ) {
          await db
            .update(schema.settings)
            .set({
              value: JSON.stringify({ ...parsed, authHeader: decrypted.reencrypted }),
              updatedAt: new Date(),
            })
            .where(
              and(eq(schema.settings.key, "siem_config"), eq(schema.settings.value, rawConfig)),
            );
        }
      }
    }
    authHeader = decrypted.value;
  }

  // 6. Map rows to SIEM event payload
  const events = rows.map((row) => ({
    timestamp: row.createdAt.toISOString(),
    event: row.action,
    actorId: row.actorId,
    actorUsername: row.actorUsername,
    targetType: row.targetType,
    targetId: row.targetId,
    ip: row.ipAddress,
    details: row.details,
  }));

  // 7. Deliver via webhook
  const result = await deliverWebhook(config.webhookUrl, authHeader, events);

  // 8. Update state based on result
  if (result.success) {
    const lastRow = rows[rows.length - 1];
    await upsertSetting(CURSOR_KEY, lastRow.createdAt.toISOString());
    if (failureCountStr !== null && failureCountStr !== "0") {
      await upsertSetting(FAILURES_KEY, "0");
    }
    return { forwarded: rows.length };
  }

  // Failure: increment circuit breaker
  await upsertSetting(FAILURES_KEY, String(failureCount + 1));
  logger.error(
    { statusCode: result.statusCode, error: result.error, attempts: result.attempts },
    `SIEM forwarding failed (attempt ${failureCount + 1}/${CIRCUIT_BREAKER_THRESHOLD}): ${result.error}`,
  );
}
