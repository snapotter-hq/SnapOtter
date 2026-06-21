import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, statfs, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { Readable } from "node:stream";
import type { S3StorageModule } from "@snapotter/enterprise";
import { env } from "../config.js";

const MIN_FREE_BYTES = 100 * 1024 * 1024;

async function assertDiskSpace(dir: string): Promise<void> {
  try {
    const stats = await statfs(dir);
    const freeBytes = stats.bfree * stats.bsize;
    if (freeBytes < MIN_FREE_BYTES) {
      const err = new Error("Insufficient disk space") as Error & { statusCode: number };
      err.statusCode = 507;
      throw err;
    }
  } catch (e) {
    if (e instanceof Error && (e as Error & { statusCode?: number }).statusCode === 507) throw e;
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
  ".dng",
  ".cr2",
  ".nef",
  ".arw",
  ".orf",
  ".rw2",
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

// ── Public API ──────────────────────────────────────────────────────

let storageReady = false;

export async function ensureStorageDir(): Promise<void> {
  if (storageReady) return;
  if (isS3Enabled()) {
    const s3 = await getS3();
    await s3.checkConnection();
    storageReady = true;
    return;
  }
  try {
    await mkdir(env.FILES_STORAGE_PATH, { recursive: true });
  } catch (e) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code === "EACCES") {
      const err = new Error("Storage directory is not writable") as Error & {
        statusCode: number;
      };
      err.statusCode = 503;
      throw err;
    }
    throw e;
  }
  storageReady = true;
}

export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  const storedName = generateStoredName(originalName);
  if (isS3Enabled()) {
    const s3 = await getS3();
    await s3.putObject(storedName, buffer);
    return storedName;
  }
  await ensureStorageDir();
  await assertDiskSpace(env.FILES_STORAGE_PATH);
  try {
    await writeFile(join(env.FILES_STORAGE_PATH, storedName), buffer);
  } catch (e) {
    if (e instanceof Error && (e as NodeJS.ErrnoException).code === "EACCES") {
      const err = new Error("Storage directory is not writable") as Error & {
        statusCode: number;
      };
      err.statusCode = 503;
      throw err;
    }
    throw e;
  }
  return storedName;
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getObject(storedName);
  }
  return readFile(join(env.FILES_STORAGE_PATH, storedName));
}

export async function streamStoredFile(storedName: string): Promise<Readable> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getObjectStream(storedName);
  }
  return createReadStream(join(env.FILES_STORAGE_PATH, storedName));
}

export async function deleteStoredFile(storedName: string): Promise<void> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    await s3.deleteObject(storedName);
    return;
  }
  try {
    await unlink(join(env.FILES_STORAGE_PATH, storedName));
  } catch {
    // File already gone
  }
}

export function getStoredFilePath(storedName: string): string {
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
    if ((err as NodeJS.ErrnoException).code === "EACCES") {
      throw Object.assign(new Error("Storage directory is not writable"), { statusCode: 503 });
    }
    throw err;
  }
  thumbDirReady = true;
}

function thumbPath(storedName: string): string {
  return join(env.FILES_STORAGE_PATH, THUMB_DIR, `${storedName}.thumb.jpg`);
}

export async function getCachedThumbnail(storedName: string): Promise<Buffer | null> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    return s3.getThumbnail(storedName);
  }
  try {
    return await readFile(thumbPath(storedName));
  } catch {
    return null;
  }
}

export async function saveThumbnail(storedName: string, buffer: Buffer): Promise<void> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    await s3.putThumbnail(storedName, buffer);
    return;
  }
  await ensureThumbDir();
  await writeFile(thumbPath(storedName), buffer);
}

export async function deleteThumbnail(storedName: string): Promise<void> {
  if (isS3Enabled()) {
    const s3 = await getS3();
    await s3.deleteThumbnail(storedName);
    return;
  }
  try {
    await unlink(thumbPath(storedName));
  } catch {
    // Thumbnail may not exist
  }
}
