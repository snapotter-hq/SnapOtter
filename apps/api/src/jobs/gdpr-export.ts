/**
 * GDPR user data export job.
 *
 * Collects all user data (profile, files metadata, job history, audit log),
 * copies library file contents, and produces a ZIP archive stored in
 * object storage under `outputs/<jobId>/gdpr-export.zip`.
 */
import { PassThrough, Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import archiver from "archiver";
import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { reportError } from "../lib/error-report.js";
import { isStorageServiceFault, readStoredFile } from "../lib/file-storage.js";
import { logger } from "../lib/logger.js";
import { deletePrefix, normalizeS3ReadFault, putObjectStream } from "../lib/object-storage.js";
import * as cancelMod from "./cancel.js";
import { registerCancelable, unregisterCancelable } from "./cancel.js";

const DEFAULT_GDPR_EXPORT_TIMEOUT_MS = 15 * 60_000;
const CLEANUP_TIMEOUT_MS = 5_000;

function exportTimeoutMs(): number {
  const configured = env.GDPR_EXPORT_TIMEOUT_MS;
  return typeof configured === "number" && Number.isFinite(configured)
    ? configured
    : DEFAULT_GDPR_EXPORT_TIMEOUT_MS;
}

function exportTimeoutError(timeoutMs: number, cause?: unknown): Error {
  return Object.assign(new Error(`GDPR export timed out after ${timeoutMs}ms`, { cause }), {
    name: "TimeoutError",
    code: "ETIMEDOUT",
  });
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
}

function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortError(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

function isUserCanceled(jobId: string): boolean {
  try {
    const fn = (cancelMod as { wasUserCanceled?: (id: string) => boolean }).wasUserCanceled;
    return typeof fn === "function" ? fn(jobId) : false;
  } catch {
    return false;
  }
}

async function cleanupOutputsBestEffort(jobId: string, userId: string): Promise<void> {
  const prefix = `outputs/${jobId}/`;
  try {
    await raceSignal(deletePrefix(prefix), AbortSignal.timeout(CLEANUP_TIMEOUT_MS));
  } catch (cleanupErr) {
    logger.error(
      { err: cleanupErr, jobId, userId, prefix },
      "gdpr export: failed to clean up outputs after abort or fault",
    );
    void reportError(cleanupErr, {
      source: "worker",
      pool: "system",
      toolId: "gdpr-export",
      jobId,
    });
  }
}

export async function gdprExportJob(
  userId: string,
  jobId: string,
): Promise<{ outputRef: string | null }> {
  const ac = registerCancelable(jobId);
  const { signal } = ac;
  const timeoutMs = exportTimeoutMs();
  let timedOut = false;
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const onTimeout = () => {
    if (signal.aborted) return;
    timedOut = true;
    ac.abort(exportTimeoutError(timeoutMs, timeoutSignal?.reason));
  };
  timeoutSignal?.addEventListener("abort", onTimeout, { once: true });

  const isTimedOut = () => timedOut && !isUserCanceled(jobId);
  const throwIfTimedOut = (cause?: unknown) => {
    if (isTimedOut()) {
      throw signal.reason instanceof Error && signal.reason.name === "TimeoutError"
        ? signal.reason
        : exportTimeoutError(timeoutMs, cause ?? timeoutSignal?.reason);
    }
  };
  const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    timeoutSignal ? raceSignal(promise, timeoutSignal) : promise;

  const isExportJobLive = async (): Promise<boolean> => {
    throwIfTimedOut();
    if (signal.aborted) return false;
    const [row] = await withTimeout(
      db
        .select({ id: schema.jobs.id, status: schema.jobs.status })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId)),
    );
    const rowLive = Boolean(row && (row.status === "queued" || row.status === "processing"));
    if (!rowLive) return false;
    throwIfTimedOut();
    return !signal.aborted;
  };

  try {
    // 1. Fetch user profile.
    //
    // The columns are named rather than selected with `*` so that authentication
    // material never leaves Postgres. passwordHash, totpSecret and recoveryCodesHash
    // are credentials, not personal data a subject-access request is owed, and this
    // archive is meant to be handed to the data subject or a regulator. Listing the
    // allowlist here also means a future column on `users` is excluded by default
    // instead of silently joining the export.
    const [profile] = await withTimeout(
      db
        .select({
          id: schema.users.id,
          username: schema.users.username,
          role: schema.users.role,
          team: schema.users.team,
          email: schema.users.email,
          authProvider: schema.users.authProvider,
          externalId: schema.users.externalId,
          scimExternalId: schema.users.scimExternalId,
          mustChangePassword: schema.users.mustChangePassword,
          legalHold: schema.users.legalHold,
          storageUsed: schema.users.storageUsed,
          storageQuota: schema.users.storageQuota,
          totpEnabled: schema.users.totpEnabled,
          createdAt: schema.users.createdAt,
          updatedAt: schema.users.updatedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId)),
    );
    if (!profile) {
      if (!(await isExportJobLive())) {
        await deletePrefix(`outputs/${jobId}/`);
        return { outputRef: null };
      }
      throw new Error(`User ${userId} not found`);
    }

    // 2. Fetch all user's files metadata
    const files = await withTimeout(
      db.select().from(schema.userFiles).where(eq(schema.userFiles.userId, userId)),
    );

    // 3. Fetch job metadata
    const jobs = await withTimeout(
      db.select().from(schema.jobs).where(eq(schema.jobs.userId, userId)),
    );

    // 4. Fetch audit log entries where user is the actor
    const auditEntries = await withTimeout(
      db.select().from(schema.auditLog).where(eq(schema.auditLog.actorId, userId)),
    );

    // 5. Build a ZIP archive in memory via archiver
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    archive.on("error", () => {});
    passthrough.on("error", () => {});
    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));

    const pipelineDone = pipeline(archive, passthrough);
    pipelineDone.catch(() => {});

    try {
      archive.append(JSON.stringify(profile, null, 2), { name: "profile.json" });

      archive.append(
        JSON.stringify(
          files.map((f) => ({
            ...f,
            createdAt: f.createdAt?.toISOString(),
          })),
          null,
          2,
        ),
        { name: "files.json" },
      );

      archive.append(
        JSON.stringify(
          jobs.map((j) => ({
            ...j,
            createdAt: j.createdAt?.toISOString(),
            startedAt: j.startedAt?.toISOString(),
            completedAt: j.completedAt?.toISOString(),
            deleteAfter: j.deleteAfter?.toISOString(),
          })),
          null,
          2,
        ),
        { name: "jobs.json" },
      );

      archive.append(
        JSON.stringify(
          auditEntries.map((a) => ({
            ...a,
            createdAt: a.createdAt?.toISOString(),
          })),
          null,
          2,
        ),
        { name: "audit-log.json" },
      );

      // 6. Copy library file contents into the ZIP
      const missingFiles: Array<{ id: string; originalName: string; storedName: string }> = [];
      for (const file of files) {
        throwIfTimedOut();
        if (signal.aborted) {
          archive.abort();
          passthrough.destroy();
          await pipelineDone.catch(() => {});
          return { outputRef: null };
        }
        let buffer: Buffer;
        try {
          buffer = await withTimeout(readStoredFile(file.storedName, { signal }));
        } catch (e) {
          throwIfTimedOut(e);
          if (signal.aborted) {
            archive.abort();
            passthrough.destroy();
            await pipelineDone.catch(() => {});
            return { outputRef: null };
          }
          // A storage service fault (rotated S3 credentials, bucket policy change,
          // S3 5xx, vanished bucket) or a local filesystem fault other than ENOENT
          // (EACCES, EIO, ERR_FS_FILE_TOO_LARGE) must fail the export rather than
          // ship an archive with library files silently missing (#975). A genuinely
          // missing blob or a poisoned stored_name from a 1.x SQLite import logs a
          // warning and goes into missing-files.json so the archive declares its
          // own gaps.
          if (isStorageServiceFault(e)) throw normalizeS3ReadFault(e);
          const { code, syscall } = (e ?? {}) as NodeJS.ErrnoException;
          if ((syscall && code !== "ENOENT") || code === "ERR_FS_FILE_TOO_LARGE") throw e;
          if (!(await isExportJobLive())) {
            archive.abort();
            passthrough.destroy();
            await pipelineDone.catch(() => {});
            await deletePrefix(`outputs/${jobId}/`);
            return { outputRef: null };
          }
          logger.warn(
            { jobId, userId, fileId: file.id, storedName: file.storedName },
            "gdpr export: stored library blob missing, skipping",
          );
          missingFiles.push({
            id: file.id,
            originalName: file.originalName,
            storedName: file.storedName,
          });
          continue;
        }
        throwIfTimedOut();
        if (signal.aborted) {
          archive.abort();
          passthrough.destroy();
          await pipelineDone.catch(() => {});
          return { outputRef: null };
        }
        archive.append(buffer, {
          name: `library-files/${file.id}_${file.originalName}`,
        });
      }

      if (missingFiles.length > 0) {
        archive.append(JSON.stringify(missingFiles, null, 2), { name: "missing-files.json" });
      }

      try {
        await withTimeout(Promise.all([archive.finalize(), pipelineDone]));
      } catch (err) {
        throwIfTimedOut(err);
        if (signal.aborted) {
          archive.abort();
          passthrough.destroy();
          await pipelineDone.catch(() => {});
          return { outputRef: null };
        }
        throw err;
      }
    } catch (err) {
      archive.abort();
      passthrough.destroy();
      await pipelineDone.catch(() => {});
      throw err;
    }

    throwIfTimedOut();

    // Confirm the export's jobs row still exists and has not been canceled before
    // writing to object storage (#1496). A concurrent GDPR purge deletes the
    // user's jobs rows, and writing after that leaves a rowless archive behind.
    if (!(await isExportJobLive())) {
      await deletePrefix(`outputs/${jobId}/`);
      return { outputRef: null };
    }

    // 7. Write ZIP to object storage. Staged and renamed (putObjectStream), not a
    // direct write: stranded-job reconciliation adopts whatever archive sits in
    // outputs/<jobId>/ as the finished export, so a write that dies partway must
    // leave nothing there (#1441).
    const zipBuffer = Buffer.concat(chunks);
    const outputRef = `outputs/${jobId}/gdpr-export.zip`;
    try {
      await withTimeout(putObjectStream(outputRef, Readable.from([zipBuffer]), { signal }));
    } catch (err) {
      if (isTimedOut()) {
        await cleanupOutputsBestEffort(jobId, userId);
        throwIfTimedOut(err);
      }
      if (signal.aborted) {
        await deletePrefix(`outputs/${jobId}/`);
        return { outputRef: null };
      }
      throw err;
    }

    // Re-check after the write finishes in case a purge deleted or canceled the
    // jobs row while putObjectStream was in flight (#1496). If the liveness
    // query itself faults, remove the written archive before rethrowing so a
    // concurrent purge cannot leave a rowless object behind.
    let liveAfterWrite = false;
    try {
      liveAfterWrite = await isExportJobLive();
    } catch (err) {
      await cleanupOutputsBestEffort(jobId, userId);
      throw err;
    }
    if (!liveAfterWrite) {
      await deletePrefix(`outputs/${jobId}/`);
      return { outputRef: null };
    }

    return { outputRef };
  } catch (err) {
    throwIfTimedOut(err);
    if (signal.aborted) {
      return { outputRef: null };
    }
    throw err;
  } finally {
    timeoutSignal?.removeEventListener("abort", onTimeout);
    unregisterCancelable(jobId);
  }
}
