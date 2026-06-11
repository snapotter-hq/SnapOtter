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
import { inArray, sql } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { getMaxAgeMs } from "../lib/cleanup.js";
import { deletePrefix, listJobDirs, type ObjectInfo } from "../lib/object-storage.js";
import { getQueue } from "./queues.js";

export const SYSTEM_JOBS = {
  storageTtl: "system:storage-ttl",
  sessionPurge: "system:session-purge",
  retention: "system:retention",
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
}

/** Enqueue a one-shot system job (e.g. startup cleanup trigger). */
export async function enqueueSystemJob(name: string): Promise<void> {
  const q = getQueue("system");
  // System cron jobs carry no tool payload; processor routes on job.name
  await q.add(name, {} as never);
}

// -- Dispatcher ---------------------------------------------------------------

export async function runSystemJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case SYSTEM_JOBS.storageTtl:
      return storageTtlSweep();
    case SYSTEM_JOBS.sessionPurge:
      return db.execute(sql`DELETE FROM sessions WHERE expires_at < now()`);
    case SYSTEM_JOBS.retention:
      return retentionSweep();
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
  const maxAgeMs = await getMaxAgeMs();
  if (maxAgeMs <= 0) return { removed: 0, failed: 0 };

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

  let removed = 0;
  const errors: string[] = [];
  for (const dir of allDirs) {
    if (decideExpiry(dir, cutoffMs, rowsById) === "expired") {
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
  return { removed, failed: errors.length };
}

// -- Retention sweep ----------------------------------------------------------

async function retentionSweep(): Promise<void> {
  if (env.JOBS_RETENTION_DAYS > 0) {
    await db.execute(
      sql`DELETE FROM jobs WHERE created_at < now() - ${env.JOBS_RETENTION_DAYS} * interval '1 day' AND status IN ('completed', 'failed', 'canceled')`,
    );
  }
  if (env.AUDIT_RETENTION_DAYS > 0) {
    await db.execute(
      sql`DELETE FROM audit_log WHERE created_at < now() - ${env.AUDIT_RETENTION_DAYS} * interval '1 day'`,
    );
  }
}
