import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "../config.js";

let storageReady = false;

export async function ensureStorageDir(): Promise<void> {
  if (storageReady) return;
  await mkdir(env.FILES_STORAGE_PATH, { recursive: true });
  storageReady = true;
}

export async function saveFile(buffer: Buffer, originalName: string): Promise<string> {
  await ensureStorageDir();
  const ext = extname(originalName).toLowerCase() || ".bin";
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
