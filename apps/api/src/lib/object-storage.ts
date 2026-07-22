import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../config.js";

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

function assertValidKey(key: string): void {
  if (!VALID_KEY.test(key) || key.includes("..")) {
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
 * walk suffices. Missing or unreadable paths contribute 0.
 */
export async function computeWorkspaceUsedBytes(root: string): Promise<number> {
  let total = 0;
  for (const prefix of ["uploads", "outputs"] as const) {
    let jobDirs: string[];
    try {
      jobDirs = await readdir(join(root, prefix));
    } catch {
      continue;
    }
    for (const jobDir of jobDirs) {
      const dir = join(root, prefix, jobDir);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch {
        continue;
      }
      for (const name of names) {
        const s = await stat(join(dir, name)).catch(() => null);
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

async function assertWorkspaceSizeCap(root: string): Promise<void> {
  const maxGb = env.MAX_WORKSPACE_SIZE_GB;
  if (maxGb <= 0) return;
  const now = Date.now();
  let used: number;
  if (workspaceSizeCache && now - workspaceSizeCache.at < WORKSPACE_SIZE_CACHE_MS) {
    used = workspaceSizeCache.bytes;
  } else {
    used = await computeWorkspaceUsedBytes(root);
    workspaceSizeCache = { bytes: used, at: now };
  }
  if (isOverWorkspaceCap(used, maxGb)) {
    const error = new Error("Workspace storage limit reached; try again shortly");
    (error as Error & { statusCode: number }).statusCode = 503;
    throw error;
  }
}

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
  } catch {
    return; // statfs unavailable (e.g. some CI envs) -- allow the write
  }
  const freeBytes = fsStats.bavail * fsStats.bsize;
  if (isBelowCapacity(freeBytes)) {
    const error = new Error("Insufficient disk space for processing");
    (error as Error & { statusCode: number }).statusCode = 503;
    throw error;
  }
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  assertValidKey(key);
  if (isS3Enabled()) {
    const s3 = await getS3();
    await s3.putGenericObject(key, data);
    return;
  }
  await assertLocalCapacity();
  const p = localPath(key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, data);
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
    source.destroy(reason);
  };
  opts.signal?.addEventListener("abort", abortSource, { once: true });
  let written = 0;
  const counter = async function* (src: AsyncIterable<Buffer>) {
    for await (const chunk of src) {
      opts.signal?.throwIfAborted();
      written += chunk.length;
      if (opts.maxBytes !== undefined && written > opts.maxBytes) {
        throw objectSizeLimitError(opts.maxBytes);
      }
      yield chunk;
    }
  };
  try {
    if (isS3Enabled()) {
      const s3 = await getS3();
      try {
        await s3.putGenericObjectStream(key, counter(source), opts.signal);
        opts.signal?.throwIfAborted();
        return written;
      } catch (error) {
        await s3.deleteGenericObject(key).catch(() => {});
        throw error;
      }
    }
    const p = localPath(key);
    try {
      await assertLocalCapacity();
      await mkdir(dirname(p), { recursive: true });
      await pipeline(counter(source), createWriteStream(p), { signal: opts.signal });
      opts.signal?.throwIfAborted();
    } catch (err) {
      await unlink(p).catch(() => {});
      throw normalizeOperationalWriteError(err);
    }
    return written;
  } finally {
    opts.signal?.removeEventListener("abort", abortSource);
  }
}

export async function getObjectStream(
  key: string,
  range?: { start: number; end?: number },
): Promise<Readable> {
  assertValidKey(key);
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getGenericObjectStream(key, range);
  }
  return createReadStream(localPath(key), range ? { start: range.start, end: range.end } : {});
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

function objectSizeLimitError(maxBytes: number): Error & { statusCode: 413 } {
  return Object.assign(new Error(`Object exceeds the maximum allowed size (${maxBytes} bytes)`), {
    statusCode: 413 as const,
  });
}

function normalizeOperationalWriteError(error: unknown): unknown {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  if (error instanceof Error && code && ["EACCES", "EDQUOT", "ENOSPC", "EROFS"].includes(code)) {
    return Object.assign(error, { statusCode: 503 });
  }
  return error;
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
  opts.signal?.throwIfAborted();

  const declaredSize = await getObjectSize(key);
  opts.signal?.throwIfAborted();
  if (declaredSize > opts.maxBytes) throw objectSizeLimitError(opts.maxBytes);

  const source = await getObjectStream(key);
  return copyReadableToFile(source, destination, opts);
}

/** Atomically spool a readable to scratch with bounded memory and cleanup. */
export async function copyReadableToFile(
  source: Readable,
  destination: string,
  opts: CopyReadableToFileOptions = {},
): Promise<number> {
  if (opts.maxBytes !== undefined && (!Number.isSafeInteger(opts.maxBytes) || opts.maxBytes < 0)) {
    throw new Error("maxBytes must be a non-negative safe integer");
  }
  opts.signal?.throwIfAborted();
  const stagingPath = `${destination}.${randomUUID()}.partial`;
  let written = 0;
  const countAndLimit = async function* (chunks: AsyncIterable<Buffer | Uint8Array | string>) {
    for await (const chunk of chunks) {
      opts.signal?.throwIfAborted();
      const bytes = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
      written += bytes;
      if (opts.maxBytes !== undefined && written > opts.maxBytes) {
        throw objectSizeLimitError(opts.maxBytes);
      }
      yield chunk;
    }
  };

  try {
    await mkdir(dirname(destination), { recursive: true });
    // Create the staging inode before constructing the stream. A write stream
    // opened with `wx` may fail the pipeline before its asynchronous open has
    // completed; cleanup can then observe ENOENT and the delayed open can leave
    // an orphan behind. Opening the already-created file with `r+` cannot
    // recreate it after cleanup.
    await writeFile(stagingPath, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
    await pipeline(countAndLimit(source), createWriteStream(stagingPath, { flags: "r+" }), {
      signal: opts.signal,
    });
    opts.signal?.throwIfAborted();
    await rename(stagingPath, destination);
    return written;
  } catch (error) {
    await unlink(stagingPath).catch(() => {});
    throw normalizeOperationalWriteError(error);
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
    const s3 = await getS3();
    await s3.deleteGenericObject(key);
    return;
  }
  await unlink(localPath(key)).catch(() => {});
}

export async function deletePrefix(prefix: string): Promise<void> {
  if (!/^(uploads|outputs)\/[A-Za-z0-9][A-Za-z0-9._-]*\/?$/.test(prefix)) {
    throw new Error(`Invalid prefix: ${prefix}`);
  }
  if (isS3Enabled()) {
    const s3 = await getS3();
    await s3.deleteGenericPrefix(prefix);
    return;
  }
  await rm(join(env.WORKSPACE_PATH, prefix), { recursive: true, force: true });
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
  try {
    const out: ObjectInfo[] = [];
    for (const name of await readdir(dir)) {
      const s = await stat(join(dir, name)).catch(() => null);
      if (s?.isFile())
        out.push({
          key: `${prefix.replace(/\/?$/, "/")}${name}`,
          size: s.size,
          mtimeMs: s.mtimeMs,
        });
    }
    return out;
  } catch {
    return [];
  }
}

// Lists the top-level job directories under a prefix with their mtime so the
// TTL sweeper can expire whole jobs. S3 derives them from key listings.
export async function listJobDirs(prefix: "uploads" | "outputs"): Promise<ObjectInfo[]> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.listGenericJobDirs(prefix);
  }
  const root = join(env.WORKSPACE_PATH, prefix);
  try {
    const out: ObjectInfo[] = [];
    for (const name of await readdir(root)) {
      const s = await stat(join(root, name)).catch(() => null);
      if (s?.isDirectory()) out.push({ key: `${prefix}/${name}`, size: 0, mtimeMs: s.mtimeMs });
    }
    return out;
  } catch {
    return [];
  }
}
