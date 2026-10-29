import { randomUUID } from "node:crypto";
import { type FileHandle, mkdir, open, readFile, rename, statfs, unlink } from "node:fs/promises";
import { basename, extname, isAbsolute, join } from "node:path";
import type { Readable } from "node:stream";
import type { S3StorageModule } from "@snapotter/enterprise";
import { CAMERA_RAW_INPUTS, isSafeMessageError, SafeError } from "@snapotter/shared";
import { env } from "../config.js";
import { logger } from "./logger.js";
import { normalizeOperationalWriteError, s3WriteFault } from "./object-storage.js";

const MIN_FREE_BYTES = 100 * 1024 * 1024;
let statfsFailureLogged = false;

async function assertDiskSpace(dir: string): Promise<void> {
  let stats: Awaited<ReturnType<typeof statfs>>;
  try {
    stats = await statfs(dir);
  } catch (err) {
    if (!statfsFailureLogged) {
      statfsFailureLogged = true;
      logger.warn(
        { err, dir },
        "Failed to check free disk space for library storage; skipping floor check",
      );
    }
    return;
  }
  const freeBytes = stats.bavail * stats.bsize;
  if (freeBytes < MIN_FREE_BYTES) {
    throw new SafeError("Insufficient disk space", {
      kind: "operational",
      code: "disk-free-floor",
      statusCode: 503,
    });
  }
}

const SAFE_STORAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".avif",
  ".svg",
  ".pdf",
  ".heic",
  ".heif",
  ".jxl",
  ".ico",
  ...CAMERA_RAW_INPUTS,
  ".tga",
  ".psd",
  ".exr",
  ".hdr",
]);

// ── S3 backend (lazy-loaded and configured on first use) ───────────

let s3Mod: S3StorageModule | null = null;

// Concurrent calls may double-initialize; configureS3 is idempotent
// (same config values, client rebuilt), so no guard is needed.
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

function isS3Enabled(): boolean {
  return env.STORAGE_MODE === "s3";
}

// ── Filename generation ─────────────────────────────────────────────

function generateStoredName(originalName: string): string {
  let ext = extname(originalName).toLowerCase() || ".bin";
  if (!SAFE_STORAGE_EXTENSIONS.has(ext)) ext = ".bin";
  return `${randomUUID()}${ext}`;
}

/**
 * Reject any stored name that could escape FILES_STORAGE_PATH.
 *
 * Stored names are generated basenames (a UUID plus a safe extension), so a
 * real value never contains a path separator, parent reference, NUL byte, or an
 * absolute path. Checking that before every join keeps file access inside the
 * storage root even when the name did not come from saveFile. The one way to
 * plant a hostile name today is the 1.x SQLite import, which copies
 * user_files.stored_name verbatim; without this guard a crafted name like
 * "../../../../etc/passwd" would let the library read and delete helpers reach
 * anything the API process can. The sibling object-storage module already
 * applies the same containment idea to its keys.
 */
function assertSafeStoredName(storedName: string): void {
  if (
    typeof storedName !== "string" ||
    storedName.length === 0 ||
    storedName === "." ||
    storedName.includes("\0") ||
    storedName.includes("/") ||
    storedName.includes("\\") ||
    storedName.includes("..") ||
    isAbsolute(storedName) ||
    basename(storedName) !== storedName
  ) {
    throw new SafeError("Invalid stored file name", {
      kind: "operational",
      code: "INVALID_STORED_NAME",
      statusCode: 400,
    });
  }
}

// ── Public API ──────────────────────────────────────────────────────

let storageReady = false;

export async function ensureStorageDir(): Promise<void> {
  if (storageReady) return;
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.checkConnection();
    } catch (err) {
      throw s3WriteFault(err);
    }
    storageReady = true;
    return;
  }
  try {
    await mkdir(env.FILES_STORAGE_PATH, { recursive: true });
  } catch (e) {
    throw storageWriteError(e);
  }
  storageReady = true;
}

/**
 * Delete what a failed write left behind. A write that fails partway (the disk
 * filling after the free-space check, an I/O error) leaves a partial file, and
 * its name never reaches the caller, so nothing else could ever remove it
 * (#1472). Only called once the file was created, so a delete that fails here
 * leaves a real orphan: log it by name, with the write error behind it.
 */
async function removePartialWrite(
  path: string,
  storedName: string,
  writeErr: unknown,
): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    // Same as image-error: pino serializes only `err`, so the write error goes in as its message.
    logger.error(
      {
        err,
        writeErr: writeErr instanceof Error ? writeErr.message : String(writeErr),
        storedName,
      },
      "Could not remove a partly written library file",
    );
  }
}

function storageWriteError(e: unknown): unknown {
  return normalizeOperationalWriteError(e);
}

export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  const storedName = generateStoredName(originalName);
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.putObject(storedName, buffer);
    } catch (err) {
      throw s3WriteFault(err);
    }
    return storedName;
  }
  await ensureStorageDir();
  await assertDiskSpace(env.FILES_STORAGE_PATH);
  const path = join(env.FILES_STORAGE_PATH, storedName);
  // Create, then write. If creating fails (a read-only volume, no permission)
  // nothing is on disk, and a cleanup would only log an orphan that doesn't
  // exist. "wx" also means a write never lands on an existing file.
  let handle: FileHandle;
  try {
    handle = await open(path, "wx");
  } catch (e) {
    throw storageWriteError(e);
  }
  let closed = false;
  try {
    await handle.writeFile(buffer);
    closed = true;
    await handle.close();
  } catch (e) {
    // The write error is the one the caller needs; a close failing on top of
    // it adds nothing.
    if (!closed) await handle.close().catch(() => {});
    await removePartialWrite(path, storedName, e);
    throw storageWriteError(e);
  }
  return storedName;
}

export async function readStoredFile(
  storedName: string,
  opts?: { signal?: AbortSignal } | AbortSignal,
): Promise<Buffer> {
  assertSafeStoredName(storedName);
  const signal = opts instanceof AbortSignal ? opts : opts?.signal;
  signal?.throwIfAborted();
  if (isS3Enabled()) {
    const s3 = await getS3();
    signal?.throwIfAborted();
    return s3.getObject(storedName, signal);
  }
  return readFile(join(env.FILES_STORAGE_PATH, storedName), signal ? { signal } : undefined);
}

/**
 * True when a readStoredFile/streamStoredFile rejection in S3 mode is a
 * storage fault that must keep reaching the error handler (#937): anything
 * except S3 reporting the object missing or this module's own SafeError
 * validation (a poisoned stored_name keeps its long-standing 404 mapping).
 * The inversion is deliberate: a fault mistaken for a missing blob presents
 * an outage as mass deletion, so only proven-missing maps to 404. Local
 * -backend rejections return false; their errno shape already routes them.
 */
export function isStorageServiceFault(error: unknown): boolean {
  if (!isS3Enabled()) return false;
  if (isSafeMessageError(error)) return false;
  return !s3Mod || !s3Mod.isMissingObjectError(error);
}

export async function streamStoredFile(storedName: string): Promise<Readable> {
  assertSafeStoredName(storedName);
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getObjectStream(storedName);
  }
  const filePath = join(env.FILES_STORAGE_PATH, storedName);
  // A path-based createReadStream defers the open, so any open-time failure
  // (missing blob, EACCES) would only surface as an async "error" event after
  // the caller's try/catch has exited. Open eagerly so those reject here,
  // like the S3 branch does.
  const handle = await open(filePath, "r");
  return handle.createReadStream();
}

export async function deleteStoredFile(storedName: string): Promise<void> {
  assertSafeStoredName(storedName);
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.deleteObject(storedName);
    } catch (err) {
      throw s3WriteFault(err);
    }
    return;
  }
  await unlinkStored(join(env.FILES_STORAGE_PATH, storedName));
}

/**
 * Remove a stored file or thumbnail. "Already gone" is fine; anything else
 * reaches the caller. Swallowing every error let a delete that failed on
 * permissions look like one that worked, and the caller then dropped the DB
 * row, orphaning the file for good (#1455). A permissions or read-only fault
 * becomes the same 503 the save path raises.
 */
async function unlinkStored(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException | null)?.code === "ENOENT") return;
    throw storageWriteError(e);
  }
}

export function getStoredFilePath(storedName: string): string {
  assertSafeStoredName(storedName);
  return join(env.FILES_STORAGE_PATH, storedName);
}

// ── Thumbnail cache ─────────────────────────────────────────────────

const THUMB_DIR = ".thumbs";
let thumbDirReady = false;

async function ensureThumbDir(): Promise<void> {
  if (thumbDirReady) return;
  if (isS3Enabled()) {
    thumbDirReady = true;
    return;
  }
  try {
    await mkdir(join(env.FILES_STORAGE_PATH, THUMB_DIR), { recursive: true });
  } catch (err: unknown) {
    throw storageWriteError(err);
  }
  thumbDirReady = true;
}

function thumbPath(storedName: string): string {
  return join(env.FILES_STORAGE_PATH, THUMB_DIR, `${storedName}.thumb.jpg`);
}

export async function getCachedThumbnail(storedName: string): Promise<Buffer | null> {
  assertSafeStoredName(storedName);
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getThumbnail(storedName);
  }
  try {
    return await readFile(thumbPath(storedName));
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
    throw err;
  }
}

export async function saveThumbnail(storedName: string, buffer: Buffer): Promise<void> {
  assertSafeStoredName(storedName);
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.putThumbnail(storedName, buffer);
    } catch (err) {
      throw s3WriteFault(err);
    }
    return;
  }
  await ensureThumbDir();
  const finalPath = thumbPath(storedName);
  const tempPath = `${finalPath}.${randomUUID()}.tmp`;
  // Write to a sibling temp file and rename into place so getCachedThumbnail
  // never observes a half-written file (#1633).
  let handle: FileHandle;
  try {
    handle = await open(tempPath, "wx");
  } catch (e) {
    throw storageWriteError(e);
  }
  let closed = false;
  try {
    await handle.writeFile(buffer);
    closed = true;
    await handle.close();
    await rename(tempPath, finalPath);
  } catch (e) {
    if (!closed) await handle.close().catch(() => {});
    await removePartialWrite(tempPath, join(THUMB_DIR, basename(tempPath)), e);
    throw storageWriteError(e);
  }
}

export async function deleteThumbnail(storedName: string): Promise<void> {
  assertSafeStoredName(storedName);
  if (isS3Enabled()) {
    try {
      const s3 = await getS3();
      await s3.deleteThumbnail(storedName);
    } catch (err) {
      throw s3WriteFault(err);
    }
    return;
  }
  await unlinkStored(thumbPath(storedName));
}
