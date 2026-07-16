/**
 * System job dispatcher and schedulers.
 *
 * Three repeatable system jobs replace the old setInterval crons:
 *   - storageTtl: sweeps uploads/ and outputs/ dirs past FILE_MAX_AGE_HOURS
 *   - sessionPurge: removes expired sessions (hourly)
 *   - retention: prunes old jobs and audit_log rows per retention env vars (6-hourly)
 *
 * The system pool also handles batch-finalize (routed by the worker before
 * calling runSystemJob); anything else is a bug.
 */
import type { Job } from "bullmq";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { analyticsEnabled } from "../lib/analytics-gate.js";
import { getMaxAgeMs } from "../lib/cleanup.js";
import { deletePrefix, listJobDirs, type ObjectInfo } from "../lib/object-storage.js";
import { getSettingNumber } from "../lib/settings-helpers.js";
import { runAuditArchive } from "./audit-archive.js";
import { getQueue } from "./queues.js";
import { runSiemForward } from "./siem-forward.js";

export const SYSTEM_JOBS = {
  storageTtl: "system:storage-ttl",
  sessionPurge: "system:session-purge",
  retention: "system:retention",
  siemForward: "system:siem-forward",
  auditArchive: "system:audit-archive",
  storageReconciliation: "system:storage-reconciliation",
  gdprExport: "system:gdpr-export",
  alertEvaluator: "system:alert-evaluator",
} as const;

// -- Scheduling ---------------------------------------------------------------

export async function scheduleSystemJobs(): Promise<void> {
  const q = getQueue("system");
  // 0 = disabled; skip storage TTL scheduler
  if (env.CLEANUP_INTERVAL_MINUTES > 0) {
    await q.upsertJobScheduler(SYSTEM_JOBS.storageTtl, {
      every: env.CLEANUP_INTERVAL_MINUTES * 60_000,
    });
  } else {
    // A scheduler registered by a previous boot survives in Redis; remove it
    // so setting CLEANUP_INTERVAL_MINUTES=0 actually disables the sweep.
    await q.removeJobScheduler(SYSTEM_JOBS.storageTtl).catch(() => {});
  }
  await q.upsertJobScheduler(SYSTEM_JOBS.sessionPurge, { every: 60 * 60_000 });
  await q.upsertJobScheduler(SYSTEM_JOBS.retention, { every: 6 * 60 * 60_000 });
  await q.upsertJobScheduler(SYSTEM_JOBS.siemForward, { every: 30_000 });
  // Monthly: 2:00 AM on the 1st of each month
  await q.upsertJobScheduler(SYSTEM_JOBS.auditArchive, {
    pattern: "0 2 1 * *",
  });
  // Weekly: 3:00 AM Sunday -- reconcile storageUsed counters
  await q.upsertJobScheduler(SYSTEM_JOBS.storageReconciliation, {
    pattern: "0 3 * * 0",
  });
  // Alert evaluator: every 60 seconds
  await q.upsertJobScheduler(SYSTEM_JOBS.alertEvaluator, { every: 60_000 });
}

/** Enqueue a one-shot system job (e.g. startup cleanup trigger). */
export async function enqueueSystemJob(name: string): Promise<void> {
  const q = getQueue("system");
  // System cron jobs carry no tool payload; processor routes on job.name
  await q.add(name, {} as never);
}

// -- Cron monitors (canonical host only) --------------------------------------

// Sentry cron monitors for the repeatable sweeps, so a silently-dead scheduler
// (disks fill, audit rows never prune) is caught. OFF by default: only the
// maintainers' canonical hosted instance sets SENTRY_CRON_MONITORS=1, because
// thousands of self-hosted installs checking into one org's monitors would make
// a "missed" signal meaningless. High-frequency pollers (siemForward,
// alertEvaluator) and on-demand jobs (gdprExport) are intentionally excluded.
type MonitorSchedule =
  | { type: "crontab"; value: string }
  | { type: "interval"; value: number; unit: "minute" | "hour" | "day" };

interface MonitorConfig {
  schedule: MonitorSchedule;
  checkinMargin: number;
  maxRuntime: number;
}

const MONITOR_CONFIG: Record<string, MonitorConfig> = {
  [SYSTEM_JOBS.storageTtl]: {
    schedule: {
      type: "interval",
      value: Math.max(1, env.CLEANUP_INTERVAL_MINUTES),
      unit: "minute",
    },
    checkinMargin: 5,
    maxRuntime: 20,
  },
  [SYSTEM_JOBS.sessionPurge]: {
    schedule: { type: "interval", value: 1, unit: "hour" },
    checkinMargin: 10,
    maxRuntime: 5,
  },
  [SYSTEM_JOBS.retention]: {
    schedule: { type: "interval", value: 6, unit: "hour" },
    checkinMargin: 15,
    maxRuntime: 30,
  },
  [SYSTEM_JOBS.auditArchive]: {
    schedule: { type: "crontab", value: "0 2 1 * *" },
    checkinMargin: 30,
    maxRuntime: 60,
  },
  [SYSTEM_JOBS.storageReconciliation]: {
    schedule: { type: "crontab", value: "0 3 * * 0" },
    checkinMargin: 30,
    maxRuntime: 60,
  },
};

function cronMonitorsEnabled(): boolean {
  const v = process.env.SENTRY_CRON_MONITORS;
  return (v === "1" || v === "true") && analyticsEnabled();
}

async function withCronMonitor(name: string, fn: () => Promise<unknown>): Promise<unknown> {
  const cfg = MONITOR_CONFIG[name];
  if (!cfg || !cronMonitorsEnabled()) return fn();
  try {
    const Sentry = await import("@sentry/node");
    // Monitor slugs cannot contain ":".
    return await Sentry.withMonitor(
      name.replace(/:/g, "-"),
      fn,
      cfg as Parameters<typeof Sentry.withMonitor>[2],
    );
  } catch {
    // Monitoring must never break the actual job.
    return fn();
  }
}

// -- Dispatcher ---------------------------------------------------------------

export async function runSystemJob(job: Job): Promise<unknown> {
  return withCronMonitor(job.name, () => dispatchSystemJob(job));
}

async function dispatchSystemJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case SYSTEM_JOBS.storageTtl:
      return storageTtlSweep();
    case SYSTEM_JOBS.sessionPurge:
      return db.execute(sql`DELETE FROM sessions WHERE expires_at < now()`);
    case SYSTEM_JOBS.retention:
      return retentionSweep();
    case SYSTEM_JOBS.siemForward:
      return runSiemForward();
    case SYSTEM_JOBS.auditArchive:
      return runAuditArchive();
    case SYSTEM_JOBS.storageReconciliation: {
      const { storageReconciliationJob } = await import("./storage-reconciliation.js");
      return storageReconciliationJob();
    }
    case SYSTEM_JOBS.gdprExport: {
      const { gdprExportJob } = await import("./gdpr-export.js");
      const exportData = job.data as unknown as { userId: string; jobId: string };
      const { outputRef } = await gdprExportJob(exportData.userId, exportData.jobId);
      // Update the job row with the output reference
      await db
        .update(schema.jobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          outputRefs: [outputRef],
        })
        .where(eq(schema.jobs.id, exportData.jobId));
      return { outputRef };
    }
    case SYSTEM_JOBS.alertEvaluator: {
      const { evaluateAlerts } = await import("./alert-evaluator.js");
      return evaluateAlerts();
    }
    default:
      // batch-finalize runs on the system pool too but is routed by the
      // worker before calling runSystemJob. Anything else is a bug.
      throw new Error(`Unknown system job: ${job.name}`);
  }
}

// -- Storage TTL sweep --------------------------------------------------------

export type DirExpiryDecision = "expired" | "keep" | "skip";

/**
 * Pure decision function for whether a storage dir should be expired.
 *
 * Three branches:
 *  - mtimeMs > 0 (local backend): expire when mtimeMs < cutoffMs
 *  - mtimeMs === 0 with a jobs row: use completedAt ?? createdAt as age basis
 *  - mtimeMs === 0 without a row: skip (data-safe)
 */
export function decideExpiry(
  dir: ObjectInfo,
  cutoffMs: number,
  rowsById: Map<string, { createdAt: Date; completedAt: Date | null }>,
): DirExpiryDecision {
  if (dir.mtimeMs > 0) {
    return dir.mtimeMs < cutoffMs ? "expired" : "keep";
  }
  // mtimeMs === 0: S3 backend cannot provide directory mtimes.
  const jobId = dir.key.split("/")[1];
  const row = rowsById.get(jobId);
  if (!row) {
    // Rowless S3 orphan: may be an in-flight upload whose jobs row has
    // not been inserted yet. Accepted as a known leak until a dedicated
    // orphan-reaper task is added.
    return "skip";
  }
  const ageMs = (row.completedAt ?? row.createdAt).getTime();
  return ageMs < cutoffMs ? "expired" : "keep";
}

async function storageTtlSweep(): Promise<{ removed: number; failed: number }> {
  // Build set of user IDs under legal hold (direct or via team) once per sweep
  const heldUserRows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.legalHold, true));
  const heldUserIds = new Set(heldUserRows.map((r) => r.id));

  const heldTeamRows = await db
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.legalHold, true));
  if (heldTeamRows.length > 0) {
    const teamUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        inArray(
          schema.users.team,
          heldTeamRows.map((r) => r.id),
        ),
      );
    for (const u of teamUsers) heldUserIds.add(u.id);
  }

  // --- Per-job deleteAfter sweep (team retention overrides) ---
  // Runs regardless of the global TTL; deleteAfter is an absolute deadline.
  let deleteAfterCleaned = 0;
  try {
    const expiredJobs = await db
      .select({ id: schema.jobs.id, userId: schema.jobs.userId })
      .from(schema.jobs)
      .where(and(isNotNull(schema.jobs.deleteAfter), lt(schema.jobs.deleteAfter, new Date())));

    for (const job of expiredJobs) {
      // Skip jobs belonging to users under legal hold
      if (job.userId && heldUserIds.has(job.userId)) continue;
      try {
        await deletePrefix(`uploads/${job.id}`);
        await deletePrefix(`outputs/${job.id}`);
        deleteAfterCleaned++;
      } catch {
        // Directory may not exist
      }
    }

    if (deleteAfterCleaned > 0) {
      console.log(`Storage TTL: cleaned up ${deleteAfterCleaned} jobs by deleteAfter`);
    }
  } catch {
    // deleteAfter sweep is best-effort
  }

  // --- Global TTL sweep ---
  const maxAgeMs = await getMaxAgeMs();
  if (maxAgeMs <= 0) return { removed: deleteAfterCleaned, failed: 0 };

  const cutoffMs = Date.now() - maxAgeMs;
  const uploadDirs = await listJobDirs("uploads");
  const outputDirs = await listJobDirs("outputs");
  const allDirs = [...uploadDirs, ...outputDirs];
  if (allDirs.length === 0) return { removed: 0, failed: 0 };

  // Batch-lookup job rows for dirs with unknown mtime (S3 backend)
  const unknownIds = [
    ...new Set(allDirs.filter((d) => d.mtimeMs === 0).map((d) => d.key.split("/")[1])),
  ];
  const rowsById = new Map<string, { createdAt: Date; completedAt: Date | null }>();
  if (unknownIds.length > 0) {
    const rows = await db
      .select({
        id: schema.jobs.id,
        createdAt: schema.jobs.createdAt,
        completedAt: schema.jobs.completedAt,
      })
      .from(schema.jobs)
      .where(inArray(schema.jobs.id, unknownIds));
    for (const r of rows) {
      rowsById.set(r.id, { createdAt: r.createdAt, completedAt: r.completedAt });
    }
  }

  // Batch-lookup userId for legal hold check (only if any users are held)
  const jobUserMap = new Map<string, string | null>();
  if (heldUserIds.size > 0 && allDirs.length > 0) {
    const allJobIds = [...new Set(allDirs.map((d) => d.key.split("/")[1]))];
    if (allJobIds.length > 0) {
      const userRows = await db
        .select({ id: schema.jobs.id, userId: schema.jobs.userId })
        .from(schema.jobs)
        .where(inArray(schema.jobs.id, allJobIds));
      for (const r of userRows) jobUserMap.set(r.id, r.userId);
    }
  }

  let removed = 0;
  const errors: string[] = [];
  for (const dir of allDirs) {
    if (decideExpiry(dir, cutoffMs, rowsById) === "expired") {
      // Skip deletion if the job's user is under legal hold
      const jobId = dir.key.split("/")[1];
      const userId = jobUserMap.get(jobId);
      if (userId && heldUserIds.has(userId)) continue;

      try {
        await deletePrefix(dir.key);
        removed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${dir.key}: ${message}`);
      }
    }
  }
  if (errors.length > 0) {
    console.error(`Storage TTL: ${errors.length} dir(s) failed to delete:\n${errors.join("\n")}`);
  }
  if (removed > 0) {
    console.log(`Storage TTL: removed ${removed} expired job dirs`);
  }
  return { removed: removed + deleteAfterCleaned, failed: errors.length };
}

// -- Retention sweep ----------------------------------------------------------

async function retentionSweep(): Promise<void> {
  // Subquery to find users under legal hold (direct or via team)
  const heldUsersSubquery = sql`(
    SELECT u.id FROM users u
    LEFT JOIN teams t ON u.team = t.id
    WHERE u.legal_hold = true OR t.legal_hold = true
  )`;

  // The Data Retention settings UI writes jobsRetentionDays / auditRetentionDays to
  // the DB. Honor those (the env vars are the fallback default), mirroring how the
  // temp-file sweep reads tempFileMaxAgeHours; otherwise the UI controls are no-ops.
  const jobsRetentionDays = await getSettingNumber("jobsRetentionDays", env.JOBS_RETENTION_DAYS);
  if (jobsRetentionDays > 0) {
    await db.execute(
      sql`DELETE FROM jobs
        WHERE created_at < now() - ${jobsRetentionDays} * interval '1 day'
        AND status IN ('completed', 'failed', 'canceled')
        AND (user_id IS NULL OR user_id NOT IN ${heldUsersSubquery})`,
    );
  }
  const auditRetentionDays = await getSettingNumber("auditRetentionDays", env.AUDIT_RETENTION_DAYS);
  if (auditRetentionDays > 0) {
    const tamperResult = await db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(eq(schema.settings.key, "tamperResistantAudit"))
      .limit(1);

    const isTamperResistant = tamperResult.length > 0 && tamperResult[0].value === "true";

    // Only delete audit logs if tamper-resistant mode is OFF
    if (!isTamperResistant) {
      await db.execute(
        sql`DELETE FROM audit_log
          WHERE created_at < now() - ${auditRetentionDays} * interval '1 day'
          AND (actor_id IS NULL OR actor_id NOT IN ${heldUsersSubquery})`,
      );
    }
  }
}
