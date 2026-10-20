import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  statfs,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, normalize, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../config.js";
import { logger } from "./logger.js";

// Processing object store: keys are "<prefix>/<jobId>/<filename>" under the
// prefixes uploads/ and outputs/. Local backend roots at WORKSPACE_PATH
// (operators keep their existing volume); S3 backend (enterprise, lazy) maps
// keys 1:1. This module replaces lib/workspace.ts.

export interface ObjectInfo {
  key: string;
  size: number;
  /**
   * Last-modified time in epoch milliseconds. 0 means UNKNOWN (the S3 backend
   * cannot cheaply provide directory mtimes): callers MUST NOT time-expire
   * entries with mtimeMs === 0; resolve their age from the jobs table instead.
   */
  mtimeMs: number;
}

const VALID_KEY = /^(uploads|outputs)\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^/\0]+$/;

/**
 * True when a key can name a stored object at all. Exported so routes can
 * reject garbage input up front instead of catching assertValidKey's plain
 * Error, which fault classification cannot tell apart from a storage fault.
 */
export function isValidObjectKey(key: string): boolean {
  return (
    VALID_KEY.test(key) &&
    !key.includes("..") &&
    !key.endsWith("/.") &&
    !key.endsWith("/.snapotter-staging")
  );
}

function assertValidKey(key: string): void {
  if (!isValidObjectKey(key)) {
    throw new Error(`Invalid object key: ${key}`);
  }
}

function localPath(key: string): string {
  const p = normalize(join(env.WORKSPACE_PATH, key));
  if (!p.startsWith(normalize(env.WORKSPACE_PATH) + sep)) {
    throw new Error(`Invalid object key: ${key}`);
  }
  return p;
}

function isS3Enabled(): boolean {
  return env.STORAGE_MODE === "s3";
}

import type { S3StorageModule } from "@snapotter/enterprise";
import { connectivityClass, isClientAbort, SafeError } from "@snapotter/shared";

let s3Mod: S3StorageModule | null = null;
// Concurrent first calls may double-configure; configureS3 is idempotent.
async function getS3(): Promise<S3StorageModule> {
  if (!s3Mod) {
    const { loadS3Storage } = await import("@snapotter/enterprise");
    const mod = await loadS3Storage();
    mod.configureS3({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      prefix: env.S3_PREFIX,
    });
    s3Mod = mod;
  }
  return s3Mod;
}

// ── Capacity guard (local backend only) ──────────────────────────
// Thresholds copied from the former workspace.ts checkWorkspaceCapacity.
// The scan-and-delete cleanup is removed; the TTL sweeper now owns that.

/** Minimum free space (GB) below which writes are rejected with 503. */
export const CAPACITY_CRITICAL_GB = 0.5;

/**
 * Pure threshold check exported for unit testing.
 * Returns true when freeBytes is below the critical threshold.
 */
export function isBelowCapacity(freeBytes: number): boolean {
  return freeBytes / 1024 ** 3 < CAPACITY_CRITICAL_GB;
}

// ── Aggregate workspace-size cap (MAX_WORKSPACE_SIZE_GB) ──────────
// A free-space floor alone does not stop SnapOtter from filling a large shared
// volume before that floor trips. The configured cap bounds uploads/ + outputs/
// regardless of how much room the underlying disk has. The total is cached
// briefly so a busy instance does not re-walk the tree on every write.

let workspaceSizeCache: { bytes: number; at: number } | null = null;
const WORKSPACE_SIZE_CACHE_MS = 30_000;

/**
 * Sum the sizes of every file under `<root>/uploads` and `<root>/outputs`. Keys
 * are always `<prefix>/<jobId>/<filename>` (two levels), so a shallow job-dir
 * walk suffices. Missing paths and non-directory entries under `<prefix>`
 * contribute 0; storage faults (`EACCES`, `EPERM`, `EIO`, ...) propagate.
 */
export async function computeWorkspaceUsedBytes(root: string): Promise<number> {
  let total = 0;
  for (const prefix of ["uploads", "outputs"] as const) {
    let jobDirs: string[];
    try {
      jobDirs = await readdir(join(root, prefix));
    } catch (err) {
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") continue;
      throw err;
    }
    for (const jobDir of jobDirs) {
      const dir = join(root, prefix, jobDir);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | null)?.code;
        if (code === "ENOENT" || code === "ENOTDIR") continue;
        throw err;
      }
      for (const name of names) {
        const s = await stat(join(dir, name)).catch((err: unknown) => {
          if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
          throw err;
        });
        if (s?.isFile()) total += s.size;
      }
    }
  }
  return total;
}

/** Pure threshold check exported for unit testing. maxGb <= 0 disables the cap. */
export function isOverWorkspaceCap(usedBytes: number, maxGb: number): boolean {
  return maxGb > 0 && usedBytes / 1024 ** 3 > maxGb;
}

async function cachedWorkspaceUsedBytes(root: string): Promise<number> {
  const now = Date.now();
  if (workspaceSizeCache && now - workspaceSizeCache.at < WORKSPACE_SIZE_CACHE_MS) {
    return workspaceSizeCache.bytes;
  }
  let used: number;
  try {
    used = await computeWorkspaceUsedBytes(root);
  } catch (err) {
    throw localWriteFault(err);
  }
  workspaceSizeCache = { bytes: used, at: now };
  return used;
}

/**
 * Bytes still available under MAX_WORKSPACE_SIZE_GB, or null when no cap
 * applies (S3 backend, cap disabled, workspace not created yet). Lets a
 * route refuse an upload it can see will not fit before reading it (#1161).
 * Shares assertWorkspaceSizeCap's cache, so it costs nothing extra on a
 * busy instance.
 */
export async function workspaceHeadroomBytes(): Promise<number | null> {
  const maxGb = env.MAX_WORKSPACE_SIZE_GB;
  if (isS3Enabled() || maxGb <= 0) return null;
  const root = env.WORKSPACE_PATH;
  if (!existsSync(root)) return null;
  const used = await cachedWorkspaceUsedBytes(root);
  return Math.max(0, maxGb * 1024 ** 3 - used);
}

async function assertWorkspaceSizeCap(root: string): Promise<void> {
  const maxGb = env.MAX_WORKSPACE_SIZE_GB;
  if (maxGb <= 0) return;
  const used = await cachedWorkspaceUsedBytes(root);
  if (isOverWorkspaceCap(used, maxGb)) {
    // "Disk full" is the canonical operational condition (error-report.ts);
    // as a plain Error this reported to Sentry as a bug (NODE-5Y). Stored
    // results only leave when the TTL sweep expires them, so "try again
    // shortly" was false for up to FILE_MAX_AGE_HOURS (#1161).
    throw new SafeError(
      "Workspace storage limit reached: stored results count against MAX_WORKSPACE_SIZE_GB until they expire (FILE_MAX_AGE_HOURS). Send fewer files at a time, or raise the limit",
      {
        kind: "operational",
        code: "workspace-cap",
        statusCode: 503,
      },
    );
  }
}

let statfsFailureLogged = false;

/**
 * Asserts that the local storage volume has enough free space.
 * Called by putObject / putObjectStream for the local backend only.
 * S3 backend skips this check entirely.
 */
export async function assertLocalCapacity(): Promise<void> {
  const root = env.WORKSPACE_PATH;
  if (!existsSync(root)) return;
  // Aggregate size cap first: it applies even where statfs is unavailable.
  await assertWorkspaceSizeCap(root);
  let fsStats: Awaited<ReturnType<typeof statfs>>;
  try {
    fsStats = await statfs(root);
  } catch (err) {
    if (!statfsFailureLogged) {
      statfsFailureLogged = true;
      logger.warn(
        { err, root },
        "Failed to check free disk space for workspace; skipping floor check",
      );
    }
    return; // statfs unavailable (e.g. some CI envs) -- allow the write
  }
  const freeBytes = fsStats.bavail * fsStats.bsize;
  if (isBelowCapacity(freeBytes)) {
    throw new SafeError("Insufficient disk space for processing", {
      kind: "operational",
      code: "disk-free-floor",
      statusCode: 503,
    });
  }
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  assertValidKey(key);
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.putGenericObject(key, data);
    } catch (err) {
      throw s3WriteFault(err);
    }
    return;
  }
  const p = localPath(key);
  const stagingDir = join(dirname(p), ".snapotter-staging");
  const stagingPath = join(stagingDir, `${basename(p)}.${randomUUID()}.partial`);
  let stagingOwned = false;
  try {
    await assertLocalCapacity();
    await mkdir(dirname(p), { recursive: true });
    await mkdir(stagingDir, { recursive: true, mode: 0o700 });
    try {
      await writeFile(stagingPath, data, { flag: "wx", mode: 0o600 });
      stagingOwned = true;
    } catch (writeErr) {
      if ((writeErr as NodeJS.ErrnoException | null)?.syscall !== "open") {
        stagingOwned = true;
      }
      throw writeErr;
    }
    await rename(stagingPath, p);
    await rmdir(stagingDir).catch(() => {});
  } catch (err) {
    if (stagingOwned) {
      await unlink(stagingPath).catch(() => {});
    }
    await rmdir(stagingDir).catch(() => {});
    throw localWriteFault(err);
  }
}

export async function putObjectStream(
  key: string,
  source: Readable,
  opts: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<number> {
  assertValidKey(key);
  opts.signal?.throwIfAborted();
  const abortSource = () => {
    const reason =
      opts.signal?.reason instanceof Error
        ? opts.signal.reason
        : Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    // An abort can arrive while local capacity/directory checks are still
    // running, before pipeline() has attached its own error listener. Keep that
    // early destroy from becoming an uncaught process-level stream error while
    // preserving the caller's exact reason for consumers that do observe it.
    if (source.listenerCount("error") === 0) source.once("error", () => {});
    source.destroy(reason);
  };
  let written = 0;
  // The first failure on the reading side: an over-limit file, the client's
  // upload breaking off, an abort. S3's multipart upload can replace it with
  // the error from aborting itself (lib-storage throws that instead), which
  // would pass a client's 413 off as a storage outage.
  let sourceError: unknown;
  const counter = async function* (src: AsyncIterable<Buffer>) {
    try {
      for await (const chunk of src) {
        opts.signal?.throwIfAborted();
        written += chunk.length;
        if (opts.maxBytes !== undefined && written > opts.maxBytes) {
          throw objectSizeLimitError(opts.maxBytes);
        }
        yield chunk;
      }
    } catch (err) {
      sourceError ??= err;
      throw err;
    }
  };
  if (isS3Enabled()) {
    opts.signal?.addEventListener("abort", abortSource, { once: true });
    let s3: S3StorageModule | undefined;
    let streamStarted = false;
    try {
      try {
        s3 = await getS3();
        opts.signal?.throwIfAborted();
        streamStarted = true;
        await s3.putGenericObjectStream(key, counter(source), opts.signal);
        opts.signal?.throwIfAborted();
        return written;
      } catch (error) {
        if (!source.destroyed) {
          if (source.listenerCount("error") === 0) source.once("error", () => {});
          source.destroy();
        }
        if (streamStarted) {
          await s3?.deleteGenericObject(key).catch(() => {});
        }
        throw sourceError !== undefined ? localWriteFault(sourceError) : s3WriteFault(error);
      }
    } finally {
      opts.signal?.removeEventListener("abort", abortSource);
    }
  }
  const p = localPath(key);
  const stagingDir = join(dirname(p), ".snapotter-staging");
  const stagingPath = join(stagingDir, `${basename(p)}.${randomUUID()}.partial`);
  let stagingOwned = false;
  opts.signal?.addEventListener("abort", abortSource, { once: true });
  try {
    try {
      await assertLocalCapacity();
      opts.signal?.throwIfAborted();
      await mkdir(dirname(p), { recursive: true });
      opts.signal?.throwIfAborted();
      await mkdir(stagingDir, { recursive: true, mode: 0o700 });
      opts.signal?.throwIfAborted();
      await writeFile(stagingPath, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
      stagingOwned = true;
      opts.signal?.throwIfAborted();
      await pipeline(counter(source), createWriteStream(stagingPath, { flags: "r+" }), {
        signal: opts.signal,
      });
      opts.signal?.throwIfAborted();
      await rename(stagingPath, p);
      await rmdir(stagingDir).catch(() => {});
    } catch (err) {
      if (stagingOwned) await unlink(stagingPath).catch(() => {});
      await rmdir(stagingDir).catch(() => {});
      throw localWriteFault(err);
    }
    return written;
  } finally {
    opts.signal?.removeEventListener("abort", abortSource);
  }
}

/**
 * True when a read-path rejection in S3 mode is a storage fault that must
 * keep reaching the error handler (#974): anything except S3 reporting the
 * object missing. Mirrors isStorageServiceFault in lib/file-storage.ts but
 * is bound to this module's own lazy S3 singleton; the two cannot share one
 * because either module may have loaded S3 while the other has not, and a
 * null singleton must fail toward "fault", never toward 404. Unlike
 * file-storage there is no SafeError carve-out: this module throws none on
 * the read path, and rethrowing one preserves its own statusCode at the
 * global handler anyway. Local-backend rejections return false; their errno
 * shape already routes them.
 */
export function isStorageServiceFault(error: unknown): boolean {
  if (!isS3Enabled()) return false;
  return !s3Mod || !s3Mod.isMissingObjectError(error);
}

/**
 * True when a read rejected because the object is not there: ENOENT on the
 * local backend, NoSuchKey/404 in S3 mode. Anything else, including an S3
 * error while the lazy singleton is unloaded, is not proven missing and
 * returns false. One inherited blind spot: a HeadObject 404 (getObjectSize)
 * looks the same for a missing key and a missing bucket (see the enterprise
 * isMissingObjectError), so only GetObject reads keep NoSuchBucket a fault.
 */
export function isMissingObjectError(error: unknown): boolean {
  if (isS3Enabled()) return !!s3Mod && s3Mod.isMissingObjectError(error);
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

export async function getObjectStream(
  key: string,
  range?: { start: number; end?: number },
): Promise<Readable> {
  assertValidKey(key);
  if (
    range !== undefined &&
    (!Number.isSafeInteger(range.start) ||
      range.start < 0 ||
      (range.end !== undefined && (!Number.isSafeInteger(range.end) || range.end < range.start)))
  ) {
    throw Object.assign(new RangeError("Invalid byte range"), { code: "ERR_OUT_OF_RANGE" });
  }
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getGenericObjectStream(key, range);
  }
  // A path-based createReadStream defers the open, so any open-time failure
  // (a blob swept after the size probe, EACCES) only surfaces as an async
  // "error" event after response headers are already on the wire (#997).
  // Open eagerly so those reject here, matching streamStoredFile (#926).
  // Range bounds are checked before open() because Node's FileHandle
  // createReadStream increments kRefs before validating start/end, which
  // would strand the descriptor on ERR_OUT_OF_RANGE and trip GC.
  const handle = await open(localPath(key), "r");
  return handle.createReadStream(range ? { start: range.start, end: range.end } : {});
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of await getObjectStream(key)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

export interface CopyObjectToFileOptions {
  /** Hard ceiling enforced both from object metadata and while streaming. */
  maxBytes: number;
  signal?: AbortSignal;
}

export interface CopyReadableToFileOptions {
  maxBytes?: number;
  signal?: AbortSignal;
}

function objectSizeLimitError(maxBytes: number): Error & { statusCode: 413; limitBytes: number } {
  // limitBytes lets multipartFailure name the limit that actually fired (#1341).
  return Object.assign(new Error(`Object exceeds the maximum allowed size (${maxBytes} bytes)`), {
    statusCode: 413 as const,
    limitBytes: maxBytes,
  });
}

/** True when the client caused this: a 4xx set upstream, or an abort, anywhere in the cause chain. */
function isClientSide(error: unknown): boolean {
  let e: unknown = error;
  for (let depth = 0; depth < 5 && e instanceof Error; depth++) {
    const status = (e as { statusCode?: unknown }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) return true;
    if (e.name === "AbortError") return true;
    e = e.cause;
  }
  return false;
}

/**
 * The codes a storage fault carries on its 503: the server's storage can't
 * take the write, whatever the request. Anything that answers a stored
 * failure by its code (the batch finalize) keeps these 503 (#1421).
 */
export const STORAGE_FAULT_CODES: ReadonlySet<string> = new Set([
  "workspace-cap",
  "disk-free-floor",
  "storage-full",
  "storage-not-writable",
  "storage-write-failed",
  "storage-unavailable",
]);

/** User-facing reasons for a storage fault, one constant per kind. */
export const STORAGE_FULL_MESSAGE = "The server's storage is full.";
export const STORAGE_NOT_WRITABLE_MESSAGE =
  "The server can't write to its storage: it's read-only or not allowed to write there.";
export const STORAGE_WRITE_FAILED_MESSAGE = "The server couldn't write to its storage.";
export const STORAGE_UNAVAILABLE_MESSAGE = "The server's storage service is unavailable.";

function storageFault(message: string, code: string, cause: unknown): SafeError {
  return new SafeError(message, { kind: "operational", code, statusCode: 503, cause });
}

/** True when the error already says whose it is, or the client caused it. */
function alreadyClassified(error: unknown): boolean {
  return isClientSide(error) || typeof (error as { statusCode?: unknown })?.statusCode === "number";
}

/** Ours: neither the client's nor the storage's, so a 500 the error handler reports. */
function serverFault(error: unknown): Error {
  const err = error instanceof Error ? error : new Error(String(error));
  return Object.assign(err, { statusCode: 500 });
}

function isS3MissingShape(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("$metadata" in error)) return false;
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (e.name === "NoSuchBucket") return false;
  return e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404;
}

/**
 * Normalize an S3 read or probe rejection (a service error carrying
 * `$metadata`, an unreachable endpoint, or a reset/prematurely closed S3
 * response stream) into a status-bearing 503 SafeError (#2808). Errors that
 * already carry a status, belong to the client, report a missing object, or
 * come from an unexpected code defect pass through.
 */
export function normalizeS3ReadFault(error: unknown): unknown {
  if (alreadyClassified(error)) return error;
  const s3Answered = typeof error === "object" && error !== null && "$metadata" in error;
  if ((s3Answered && !isS3MissingShape(error)) || connectivityClass(error) === "net-unavailable") {
    return storageFault(STORAGE_UNAVAILABLE_MESSAGE, "storage-unavailable", error);
  }
  const code = (error as NodeJS.ErrnoException | null)?.code;
  if (code === "EIO" || isClientAbort(error)) {
    return storageFault(STORAGE_UNAVAILABLE_MESSAGE, "storage-unavailable", error);
  }
  return error;
}

/**
 * Normalize a local operational write errno (ENOSPC, EDQUOT, EACCES, EPERM,
 * EROFS) or an S3 service fault into a status-bearing 503 SafeError (#1552).
 * Errors that already carry a status or belong to the client pass through.
 */
export function normalizeOperationalWriteError(error: unknown): unknown {
  if (alreadyClassified(error)) return error;
  const { code } = (error ?? {}) as NodeJS.ErrnoException;
  if (code === "ENOSPC" || code === "EDQUOT") {
    return storageFault(STORAGE_FULL_MESSAGE, "storage-full", error);
  }
  if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
    return storageFault(STORAGE_NOT_WRITABLE_MESSAGE, "storage-not-writable", error);
  }
  const s3Answered = typeof error === "object" && error !== null && "$metadata" in error;
  if ((s3Answered && !isS3MissingShape(error)) || connectivityClass(error) === "net-unavailable") {
    return storageFault(STORAGE_UNAVAILABLE_MESSAGE, "storage-unavailable", error);
  }
  return error;
}

/**
 * What a failed local write means for the request behind it. Without a
 * status, the tool routes answered every one of these as a malformed request
 * (a 400), and nothing was reported (#1421). The client's own faults and
 * errors that already carry a status (the workspace cap, the disk floor, an
 * over-limit file) pass through; a storage errno becomes a 503 naming the
 * condition, with the errno as its cause; anything else is a 500.
 */
function localWriteFault(error: unknown): unknown {
  const normalized = normalizeOperationalWriteError(error);
  if (alreadyClassified(normalized)) return normalized;
  const { syscall } = (error ?? {}) as NodeJS.ErrnoException;
  if (typeof syscall === "string") {
    return storageFault(STORAGE_WRITE_FAILED_MESSAGE, "storage-write-failed", error);
  }
  return serverFault(error);
}

/**
 * The S3 counterpart: a refusal (the SDK's service errors carry `$metadata`)
 * or an endpoint it couldn't reach is a 503 storage fault; the client's own
 * faults pass through; anything else is ours.
 */
export function s3WriteFault(error: unknown): unknown {
  const normalized = normalizeOperationalWriteError(error);
  if (alreadyClassified(normalized)) return normalized;
  const s3Answered = typeof error === "object" && error !== null && "$metadata" in error;
  if (s3Answered) {
    return storageFault(STORAGE_UNAVAILABLE_MESSAGE, "storage-unavailable", error);
  }
  return serverFault(error);
}

/**
 * Copy one object into scratch storage without materializing it as a Buffer.
 *
 * The metadata check avoids downloading a known-oversized S3 object, while
 * the streaming counter remains authoritative if the object changes between
 * the size lookup and read. Partial destinations are always removed.
 */
export async function copyObjectToFile(
  key: string,
  destination: string,
  opts: CopyObjectToFileOptions,
): Promise<number> {
  if (!Number.isSafeInteger(opts.maxBytes) || opts.maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative safe integer");
  }
  assertValidKey(key);
  opts.signal?.throwIfAborted();

  let source: Readable;
  try {
    const declaredSize = await getObjectSize(key);
    opts.signal?.throwIfAborted();
    if (declaredSize > opts.maxBytes) throw objectSizeLimitError(opts.maxBytes);

    source = await getObjectStream(key);
  } catch (error) {
    if (opts.signal?.aborted && error === opts.signal.reason) throw error;
    if (isMissingObjectError(error)) throw error;
    throw isS3Enabled() ? s3WriteFault(normalizeS3ReadFault(error)) : localWriteFault(error);
  }
  return copyReadableToFile(
    source,
    destination,
    opts,
    isS3Enabled() ? (err) => s3WriteFault(normalizeS3ReadFault(err)) : undefined,
  );
}

/** Atomically spool a readable to scratch with bounded memory and cleanup. */
export async function copyReadableToFile(
  source: Readable,
  destination: string,
  opts: CopyReadableToFileOptions = {},
  classifySourceFault?: (error: unknown) => unknown,
): Promise<number> {
  const destroySource = () => {
    if (!source.destroyed) {
      if (source.listenerCount("error") === 0) source.once("error", () => {});
      source.destroy();
    }
  };
  if (opts.maxBytes !== undefined && (!Number.isSafeInteger(opts.maxBytes) || opts.maxBytes < 0)) {
    destroySource();
    throw new Error("maxBytes must be a non-negative safe integer");
  }
  const stagingPath = `${destination}.${randomUUID()}.partial`;
  let stagingOwned = false;
  let written = 0;
  let sourceError: unknown;
  const countAndLimit = async function* (chunks: AsyncIterable<Buffer | Uint8Array | string>) {
    try {
      for await (const chunk of chunks) {
        opts.signal?.throwIfAborted();
        const bytes = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
        written += bytes;
        if (opts.maxBytes !== undefined && written > opts.maxBytes) {
          throw objectSizeLimitError(opts.maxBytes);
        }
        yield chunk;
      }
    } catch (err) {
      sourceError ??= err;
      throw err;
    }
  };

  try {
    opts.signal?.throwIfAborted();
    await mkdir(dirname(destination), { recursive: true });
    opts.signal?.throwIfAborted();
    // Create the staging inode before constructing the stream. A write stream
    // opened with `wx` may fail the pipeline before its asynchronous open has
    // completed; cleanup can then observe ENOENT and the delayed open can leave
    // an orphan behind. Opening the already-created file with `r+` cannot
    // recreate it after cleanup.
    await writeFile(stagingPath, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    stagingOwned = true;
    opts.signal?.throwIfAborted();
    await pipeline(countAndLimit(source), createWriteStream(stagingPath, { flags: "r+" }), {
      signal: opts.signal,
    });
    opts.signal?.throwIfAborted();
    await rename(stagingPath, destination);
    return written;
  } catch (error) {
    destroySource();
    if (stagingOwned) await unlink(stagingPath).catch(() => {});
    if (opts.signal?.aborted && error === opts.signal.reason) throw error;
    if (sourceError !== undefined && classifySourceFault) {
      throw classifySourceFault(sourceError);
    }
    throw localWriteFault(error);
  }
}

export async function getObjectSize(key: string): Promise<number> {
  assertValidKey(key);
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getGenericObjectSize(key);
  }
  return (await stat(localPath(key))).size;
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getObjectSize(key);
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  assertValidKey(key);
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.deleteGenericObject(key);
    } catch (err) {
      throw s3WriteFault(err);
    }
    return;
  }
  const p = localPath(key);
  try {
    await unlink(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") {
      throw localWriteFault(err);
    }
  }
  // A delete is the one write that frees space; a cached total that outlives
  // it would keep refusing the retry the cap message just asked for (#1161).
  workspaceSizeCache = null;
}

export async function deletePrefix(prefix: string): Promise<void> {
  if (!/^(uploads|outputs)\/[A-Za-z0-9][A-Za-z0-9._-]*\/?$/.test(prefix)) {
    throw new Error(`Invalid prefix: ${prefix}`);
  }
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.deleteGenericPrefix(prefix);
    } catch (err) {
      throw s3WriteFault(err);
    }
    return;
  }
  try {
    await rm(join(env.WORKSPACE_PATH, prefix), { recursive: true, force: true });
  } catch (err) {
    throw localWriteFault(err);
  }
  workspaceSizeCache = null;
}

export async function listObjects(prefix: string): Promise<ObjectInfo[]> {
  if (!/^(uploads|outputs)\/[A-Za-z0-9][A-Za-z0-9._-]*\/?$/.test(prefix) || prefix.includes("..")) {
    throw new Error(`Invalid prefix: ${prefix}`);
  }
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.listGenericObjects(prefix);
  }
  const dir = join(env.WORKSPACE_PATH, prefix);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return [];
    throw err;
  }
  const out: ObjectInfo[] = [];
  for (const name of names) {
    const s = await stat(join(dir, name)).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
      throw err;
    });
    if (s?.isFile())
      out.push({
        key: `${prefix.replace(/\/?$/, "/")}${name}`,
        size: s.size,
        mtimeMs: s.mtimeMs,
      });
  }
  return out;
}

// Lists the top-level job directories under a prefix with their mtime so the
// TTL sweeper can expire whole jobs. S3 derives them from key listings.
export async function listJobDirs(prefix: "uploads" | "outputs"): Promise<ObjectInfo[]> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.listGenericJobDirs(prefix);
  }
  const root = join(env.WORKSPACE_PATH, prefix);
  let names: string[];
  try {
    names = await readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return [];
    throw err;
  }
  const out: ObjectInfo[] = [];
  for (const name of names) {
    const s = await stat(join(root, name)).catch((err: unknown) => {
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
      throw err;
    });
    if (s?.isDirectory()) out.push({ key: `${prefix}/${name}`, size: 0, mtimeMs: s.mtimeMs });
  }
  return out;
}
