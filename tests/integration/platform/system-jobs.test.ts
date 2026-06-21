/**
 * Integration tests for the system job dispatcher and schedulers.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { runMigrations } from "../../../apps/api/src/db/migrate.js";
import { closeQueues, getQueue } from "../../../apps/api/src/jobs/queues.js";
import {
  decideExpiry,
  runSystemJob,
  SYSTEM_JOBS,
  scheduleSystemJobs,
} from "../../../apps/api/src/jobs/system-jobs.js";
import type { ObjectInfo } from "../../../apps/api/src/lib/object-storage.js";
import * as objectStorage from "../../../apps/api/src/lib/object-storage.js";

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  const q = getQueue("system");
  for (const name of Object.values(SYSTEM_JOBS)) {
    await q.removeJobScheduler(name).catch(() => {});
  }
  await closeQueues();
});

// -- decideExpiry (pure function) ---------------------------------------------

describe("decideExpiry", () => {
  const cutoff = Date.now() - 3600_000;

  it("expires local dir whose mtimeMs is older than cutoff", () => {
    const dir: ObjectInfo = { key: "uploads/job-old", size: 0, mtimeMs: cutoff - 1000 };
    expect(decideExpiry(dir, cutoff, new Map())).toBe("expired");
  });

  it("keeps local dir whose mtimeMs is newer than cutoff", () => {
    const dir: ObjectInfo = { key: "uploads/job-new", size: 0, mtimeMs: cutoff + 1000 };
    expect(decideExpiry(dir, cutoff, new Map())).toBe("keep");
  });

  it("expires S3 dir (mtimeMs=0) with old completed row", () => {
    const dir: ObjectInfo = { key: "outputs/job-s3", size: 0, mtimeMs: 0 };
    const rows = new Map([
      ["job-s3", { createdAt: new Date(cutoff - 2000), completedAt: new Date(cutoff - 1000) }],
    ]);
    expect(decideExpiry(dir, cutoff, rows)).toBe("expired");
  });

  it("keeps S3 dir (mtimeMs=0) with recent row", () => {
    const dir: ObjectInfo = { key: "outputs/job-s3-new", size: 0, mtimeMs: 0 };
    const rows = new Map([
      ["job-s3-new", { createdAt: new Date(cutoff + 1000), completedAt: null }],
    ]);
    expect(decideExpiry(dir, cutoff, rows)).toBe("keep");
  });

  it("skips S3 dir (mtimeMs=0) without a jobs row", () => {
    const dir: ObjectInfo = { key: "uploads/orphan-x", size: 0, mtimeMs: 0 };
    expect(decideExpiry(dir, cutoff, new Map())).toBe("skip");
  });

  it("uses completedAt over createdAt when both are present", () => {
    const dir: ObjectInfo = { key: "outputs/job-both", size: 0, mtimeMs: 0 };
    // createdAt is old but completedAt is recent: dir should be kept
    const rows = new Map([
      ["job-both", { createdAt: new Date(cutoff - 5000), completedAt: new Date(cutoff + 1000) }],
    ]);
    expect(decideExpiry(dir, cutoff, rows)).toBe("keep");
  });
});

// -- runSystemJob -------------------------------------------------------------

describe("runSystemJob", () => {
  const testUserId = `sys-test-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    await db.insert(schema.users).values({
      id: testUserId,
      username: `systest-${randomUUID().slice(0, 8)}`,
      passwordHash: "hash",
      role: "user",
      team: "Default",
      mustChangePassword: false,
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.sessions)
      .where(eq(schema.sessions.userId, testUserId))
      .catch(() => {});
    await db
      .delete(schema.users)
      .where(eq(schema.users.id, testUserId))
      .catch(() => {});
  });

  it("storageTtl removes stale local dirs and keeps fresh ones", async () => {
    const staleJobId = `oldjob-${randomUUID().slice(0, 8)}`;
    const freshJobId = `newjob-${randomUUID().slice(0, 8)}`;

    const staleDir = join(env.WORKSPACE_PATH, "uploads", staleJobId);
    const freshDir = join(env.WORKSPACE_PATH, "uploads", freshJobId);

    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(staleDir, "f.txt"), "stale");
    // Write file first, THEN backdate the directory mtime
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(join(staleDir, "f.txt"), past, past);
    utimesSync(staleDir, past, past);

    mkdirSync(freshDir, { recursive: true });
    writeFileSync(join(freshDir, "g.txt"), "fresh");

    const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as unknown as Job);
    expect((result as { removed: number }).removed).toBeGreaterThanOrEqual(1);
    expect(existsSync(staleDir)).toBe(false);
    expect(existsSync(freshDir)).toBe(true);

    await rm(freshDir, { recursive: true, force: true }).catch(() => {});
  });

  it("sessionPurge deletes expired sessions", async () => {
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: testUserId,
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    await runSystemJob({ name: SYSTEM_JOBS.sessionPurge } as unknown as Job);

    const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
    expect(row).toBeUndefined();
  });

  it("retention removes old completed jobs and old audit rows", async () => {
    const oldJobId = `old-j-${randomUUID().slice(0, 8)}`;
    const freshJobId = `new-j-${randomUUID().slice(0, 8)}`;
    const oldAuditId = `old-a-${randomUUID().slice(0, 8)}`;

    await db.execute(
      sql`INSERT INTO jobs (id, type, status, created_at) VALUES (${oldJobId}, 'tool', 'completed', now() - interval '90 days')`,
    );

    await db.insert(schema.jobs).values({
      id: freshJobId,
      type: "tool",
      status: "completed",
    });

    await db.execute(
      sql`INSERT INTO audit_log (id, actor_username, action, created_at) VALUES (${oldAuditId}, 'test', 'test', now() - interval '90 days')`,
    );

    const origJobsRetention = env.JOBS_RETENTION_DAYS;
    const origAuditRetention = env.AUDIT_RETENTION_DAYS;
    (env as Record<string, unknown>).JOBS_RETENTION_DAYS = 30;
    (env as Record<string, unknown>).AUDIT_RETENTION_DAYS = 30;

    try {
      await runSystemJob({ name: SYSTEM_JOBS.retention } as unknown as Job);

      const [oldRow] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, oldJobId));
      expect(oldRow).toBeUndefined();

      const [freshRow] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, freshJobId));
      expect(freshRow).toBeDefined();

      const [auditRow] = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.id, oldAuditId));
      expect(auditRow).toBeUndefined();
    } finally {
      (env as Record<string, unknown>).JOBS_RETENTION_DAYS = origJobsRetention;
      (env as Record<string, unknown>).AUDIT_RETENTION_DAYS = origAuditRetention;
      await db
        .delete(schema.jobs)
        .where(eq(schema.jobs.id, freshJobId))
        .catch(() => {});
    }
  });

  it("throws on unknown system job name", async () => {
    await expect(runSystemJob({ name: "system:bogus" } as unknown as Job)).rejects.toThrow(
      "Unknown system job: system:bogus",
    );
  });

  it("continues sweeping when a per-dir deletePrefix fails", async () => {
    const failJobId = `fail-${randomUUID().slice(0, 8)}`;
    const okJobId = `ok-${randomUUID().slice(0, 8)}`;

    const failDir = join(env.WORKSPACE_PATH, "uploads", failJobId);
    const okDir = join(env.WORKSPACE_PATH, "uploads", okJobId);

    mkdirSync(failDir, { recursive: true });
    writeFileSync(join(failDir, "a.txt"), "fail");
    mkdirSync(okDir, { recursive: true });
    writeFileSync(join(okDir, "b.txt"), "ok");

    // Backdate both dirs so they are expired
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(join(failDir, "a.txt"), past, past);
    utimesSync(failDir, past, past);
    utimesSync(join(okDir, "b.txt"), past, past);
    utimesSync(okDir, past, past);

    const realDeletePrefix = objectStorage.deletePrefix;
    const spy = vi
      .spyOn(objectStorage, "deletePrefix")
      .mockImplementation(async (prefix: string) => {
        if (prefix.includes(failJobId)) {
          throw new Error("S3 partial failure");
        }
        return realDeletePrefix(prefix);
      });

    try {
      const result = await runSystemJob({ name: SYSTEM_JOBS.storageTtl } as unknown as Job);
      const typed = result as { removed: number; failed: number };
      expect(typed.removed).toBeGreaterThanOrEqual(1);
      expect(typed.failed).toBeGreaterThanOrEqual(1);
      // The ok dir should have been cleaned
      expect(existsSync(okDir)).toBe(false);
      // The fail dir should still exist (deletion failed)
      expect(existsSync(failDir)).toBe(true);
    } finally {
      spy.mockRestore();
      await rm(failDir, { recursive: true, force: true }).catch(() => {});
      await rm(okDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// -- scheduleSystemJobs -------------------------------------------------------

describe("scheduleSystemJobs", () => {
  it("registers all three system job schedulers", async () => {
    await scheduleSystemJobs();
    const q = getQueue("system");
    const schedulers = await q.getJobSchedulers();
    const ids = schedulers.map((s) => s.key);
    expect(ids).toContain(SYSTEM_JOBS.storageTtl);
    expect(ids).toContain(SYSTEM_JOBS.sessionPurge);
    expect(ids).toContain(SYSTEM_JOBS.retention);
  });

  it("skips storageTtl scheduler when CLEANUP_INTERVAL_MINUTES <= 0", async () => {
    const orig = env.CLEANUP_INTERVAL_MINUTES;
    (env as Record<string, unknown>).CLEANUP_INTERVAL_MINUTES = 0;

    try {
      const q = getQueue("system");
      for (const name of Object.values(SYSTEM_JOBS)) {
        await q.removeJobScheduler(name).catch(() => {});
      }

      await scheduleSystemJobs();
      const schedulers = await q.getJobSchedulers();
      const ids = schedulers.map((s) => s.key);
      expect(ids).not.toContain(SYSTEM_JOBS.storageTtl);
      expect(ids).toContain(SYSTEM_JOBS.sessionPurge);
      expect(ids).toContain(SYSTEM_JOBS.retention);
    } finally {
      (env as Record<string, unknown>).CLEANUP_INTERVAL_MINUTES = orig;
    }
  });

  it("removes stale storageTtl scheduler when CLEANUP_INTERVAL_MINUTES changes to 0", async () => {
    const orig = env.CLEANUP_INTERVAL_MINUTES;
    (env as Record<string, unknown>).CLEANUP_INTERVAL_MINUTES = 5;

    try {
      await scheduleSystemJobs();
      const q = getQueue("system");
      let schedulers = await q.getJobSchedulers();
      let ids = schedulers.map((s) => s.key);
      expect(ids).toContain(SYSTEM_JOBS.storageTtl);
      expect(ids).toContain(SYSTEM_JOBS.sessionPurge);
      expect(ids).toContain(SYSTEM_JOBS.retention);

      // Operator disables cleanup; stale scheduler must be removed
      (env as Record<string, unknown>).CLEANUP_INTERVAL_MINUTES = 0;
      await scheduleSystemJobs();
      schedulers = await q.getJobSchedulers();
      ids = schedulers.map((s) => s.key);
      expect(ids).not.toContain(SYSTEM_JOBS.storageTtl);
      expect(ids).toContain(SYSTEM_JOBS.sessionPurge);
      expect(ids).toContain(SYSTEM_JOBS.retention);
    } finally {
      (env as Record<string, unknown>).CLEANUP_INTERVAL_MINUTES = orig;
    }
  });
});
