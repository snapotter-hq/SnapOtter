import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { env } from "../config.js";

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

let storageReady = false;

export async function ensureStorageDir(): Promise<void> {
  if (storageReady) return;
  await mkdir(env.FILES_STORAGE_PATH, { recursive: true });
  storageReady = true;
}

export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  await ensureStorageDir();
  let ext = extname(originalName).toLowerCase() || ".bin";
  // Only allow known image extensions to be stored — reject dangerous extensions
  // even if they somehow pass upstream sanitization.
  if (!SAFE_STORAGE_EXTENSIONS.has(ext)) {
    ext = ".bin";
  }
  const storedName = `${randomUUID()}${ext}`;
  await writeFile(join(env.FILES_STORAGE_PATH, storedName), buffer);
  return storedName;
}

export async function deleteStoredFile(storedName: string): Promise<void> {
  try {
    await unlink(join(env.FILES_STORAGE_PATH, storedName));
  } catch {
    // File already gone
  }
}

export function getStoredFilePath(storedName: string): string {
  return join(env.FILES_STORAGE_PATH, storedName);
}

// ── Thumbnail cache ──────────────────────────────────────────────────

const THUMB_DIR = ".thumbs";
let thumbDirReady = false;

async function ensureThumbDir(): Promise<void> {
  if (thumbDirReady) return;
  await mkdir(join(env.FILES_STORAGE_PATH, THUMB_DIR), { recursive: true });
  thumbDirReady = true;
}

function thumbPath(storedName: string): string {
  return join(env.FILES_STORAGE_PATH, THUMB_DIR, `${storedName}.thumb.jpg`);
}

export async function getCachedThumbnail(storedName: string): Promise<Buffer | null> {
  try {
    return await readFile(thumbPath(storedName));
  } catch {
    return null;
  }
}

export async function saveThumbnail(storedName: string, buffer: Buffer): Promise<void> {
  await ensureThumbDir();
  await writeFile(thumbPath(storedName), buffer);
}

export async function deleteThumbnail(storedName: string): Promise<void> {
  try {
    await unlink(thumbPath(storedName));
  } catch {
    // Thumbnail may not exist
  }
}
