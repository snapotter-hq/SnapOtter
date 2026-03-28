import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
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
