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
import { asc, eq, gte } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { decrypt, isEncrypted } from "../lib/encryption.js";
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
  try {
    const { isFeatureEnabled } = await import("@snapotter/enterprise");
    return isFeatureEnabled("siem_forwarding");
  } catch {
    return false;
  }
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
  const failureCount = failureCountStr ? parseInt(failureCountStr, 10) : 0;
  if (failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    console.warn(
      `SIEM forwarding circuit breaker open: ${failureCount} consecutive failures. ` +
        "Reset siem_consecutive_failures to 0 in settings to re-enable.",
    );
    return;
  }

  // 3. Read cursor
  const cursor = await readSettingValue(CURSOR_KEY);

  // 4. Query audit_log for new rows (createdAt-based cursor; may re-deliver
  //    boundary events on restart, but SIEMs handle idempotent ingestion)
  const cursorDate = cursor ? new Date(cursor) : null;
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
  if (authHeader && isEncrypted(authHeader) && env.DATA_ENCRYPTION_KEY) {
    const decrypted = await decrypt(authHeader, env.DATA_ENCRYPTION_KEY);
    authHeader = decrypted ?? "";
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
    if (failureCount > 0) {
      await upsertSetting(FAILURES_KEY, "0");
    }
    return { forwarded: rows.length };
  }

  // Failure: increment circuit breaker
  await upsertSetting(FAILURES_KEY, String(failureCount + 1));
  console.error(
    `SIEM forwarding failed (attempt ${failureCount + 1}/${CIRCUIT_BREAKER_THRESHOLD}): ${result.error}`,
  );
}
