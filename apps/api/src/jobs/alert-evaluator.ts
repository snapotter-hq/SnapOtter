/**
 * Alert condition evaluator.
 *
 * A periodic system job (every 60s) that checks several health/security
 * conditions and delivers alerts to webhook destinations of type "alerts".
 *
 * Conditions checked:
 *   - Disk space below threshold (< 1 GB)
 *   - Auth anomaly (> 20 login failures in 5 minutes)
 *   - Backup staleness (> 48 hours since last completed backup)
 *   - License expiring (< 30 days remaining)
 */
import { statfs } from "node:fs/promises";
import { SafeError } from "@snapotter/shared";
import { and, eq, gte, sql } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { decryptSettingWithRotation } from "../lib/encryption.js";
import { isEnterpriseFeatureEnabled } from "../lib/enterprise-feature.js";
import { reportError } from "../lib/error-report.js";
import { logger } from "../lib/logger.js";
import { getSettingString } from "../lib/settings-helpers.js";

/**
 * In-memory license check, no DB access. This evaluator runs every 60s on
 * every instance and previously queried settings even when unlicensed, where
 * no supported path can create alert destinations. Gated for licensing parity
 * with the SIEM job's NODE-1E fix (that job's unguarded settings read is what
 * stormed Sentry, not this one).
 */
async function alertsLicensed(): Promise<boolean> {
  return isEnterpriseFeatureEnabled("admin_alerts", "worker");
}

export async function evaluateAlerts(): Promise<void> {
  if (!(await alertsLicensed())) return;

  // 1. Read webhook destinations from settings
  const destJson = await getSettingString("webhook_destinations", "[]");
  let destinations: {
    name?: string;
    url: string;
    authHeader: string;
    enabled: boolean;
    type: string;
  }[];
  try {
    const parsed: unknown = JSON.parse(destJson);
    if (!Array.isArray(parsed)) {
      logger.warn(
        { key: "webhook_destinations" },
        "alert-evaluator: stored webhook_destinations is not a JSON array",
      );
      return;
    }
    destinations = parsed as typeof destinations;
  } catch (err) {
    logger.warn(
      { err, key: "webhook_destinations" },
      "alert-evaluator: failed to parse stored webhook_destinations JSON",
    );
    return;
  }

  // 2. Filter to type = "alerts" and enabled = true
  const alertDests = destinations.filter((d) => d.enabled && d.type === "alerts");
  if (alertDests.length === 0) return;

  // 3. Check conditions
  const alerts: Record<string, unknown>[] = [];

  // a. Disk space below threshold (< 1 GB)
  try {
    const stats = await statfs(env.WORKSPACE_PATH);
    const freeGb = (stats.bfree * stats.bsize) / 1024 ** 3;
    if (freeGb < 1) {
      alerts.push({ condition: "disk_space_low", freeGb, threshold: 1 });
    }
  } catch {
    // statfs may fail on some filesystems; skip check
  }

  // b. Auth anomaly (> 20 failures in last 5 minutes)
  try {
    const recentFailures = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.action, "LOGIN_FAILED"),
          gte(schema.auditLog.createdAt, new Date(Date.now() - 5 * 60 * 1000)),
        ),
      );
    if (recentFailures[0].count > 20) {
      alerts.push({
        condition: "auth_anomaly",
        failedLogins: recentFailures[0].count,
        windowMinutes: 5,
      });
    }
  } catch {
    // Query may fail if audit_log is unavailable
  }

  // c. Backup staleness (> 48 hours)
  try {
    const backupResult = await getSettingString("backup_last_completed", "");
    if (backupResult) {
      const lastBackup = JSON.parse(backupResult);
      const ageHours = (Date.now() - new Date(lastBackup.timestamp).getTime()) / 3_600_000;
      if (ageHours > 48) {
        alerts.push({ condition: "backup_stale", ageHours, threshold: 48 });
      }
    } else {
      alerts.push({ condition: "backup_never_run" });
    }
  } catch {
    // Backup check is best-effort
  }

  // d. License expiration (< 30 days)
  try {
    const { getActiveLicense } = await import("@snapotter/enterprise");
    const license = getActiveLicense();
    if (license?.expiresAt) {
      const daysLeft = (new Date(license.expiresAt).getTime() - Date.now()) / 86_400_000;
      if (daysLeft < 30) {
        alerts.push({ condition: "license_expiring", daysLeft: Math.floor(daysLeft) });
      }
    }
  } catch {
    // Enterprise package not available; skip
  }

  // 4. If no alerts triggered, nothing to do
  if (alerts.length === 0) return;

  // 5. Deliver to each enabled "alerts" webhook
  let delivered = 0;
  let currentDestJson = destJson;
  for (const dest of alertDests) {
    let authHeader = dest.authHeader;

    // Decrypt auth header if encrypted
    if (authHeader) {
      const decrypted = await decryptSettingWithRotation(authHeader);
      if (decrypted === null) {
        logger.error(
          { name: dest.name },
          "alert-evaluator: stored webhook authHeader could not be decrypted; check DATA_ENCRYPTION_KEY and DATA_ENCRYPTION_KEY_PREVIOUS",
        );
        void reportError(
          new SafeError("Failed to decrypt alert webhook auth header", {
            kind: "operational",
            code: "ALERT_DECRYPTION_FAILED",
          }),
          {
            source: "worker",
            pool: "system",
            subsystem: "alert-evaluator",
          },
        );
        continue;
      }
      if (decrypted.reencrypted) {
        dest.authHeader = decrypted.reencrypted;
        const nextDestJson = JSON.stringify(destinations);
        await db
          .update(schema.settings)
          .set({ value: nextDestJson, updatedAt: new Date() })
          .where(
            and(
              eq(schema.settings.key, "webhook_destinations"),
              eq(schema.settings.value, currentDestJson),
            ),
          );
        currentDestJson = nextDestJson;
      }
      authHeader = decrypted.value;
    }

    const { deliverWebhook } = await import("../lib/webhook-delivery.js");
    const result = await deliverWebhook(dest.url, authHeader, alerts, { maxRetries: 1 });
    if (result?.success !== false) {
      delivered++;
    } else {
      logger.error(
        { name: dest.name, statusCode: result.statusCode, error: result.error },
        "alert-evaluator: webhook delivery failed",
      );
    }
  }

  if (delivered > 0) {
    console.log(`Alert evaluation complete: ${alerts.length} alert(s) delivered`);
  }
}
