import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
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

function useS3(): boolean {
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

export async function putObject(key: string, data: Buffer): Promise<void> {
  assertValidKey(key);
  if (useS3()) {
    const s3 = await getS3();
    await s3.putGenericObject(key, data);
    return;
  }
  const p = localPath(key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, data);
}

export async function putObjectStream(
  key: string,
  source: Readable,
  opts: { maxBytes?: number } = {},
): Promise<number> {
  assertValidKey(key);
  let written = 0;
  const counter = async function* (src: AsyncIterable<Buffer>) {
    for await (const chunk of src) {
      written += chunk.length;
      if (opts.maxBytes && written > opts.maxBytes) {
        throw new Error(`Upload exceeds the maximum allowed size (${opts.maxBytes} bytes)`);
      }
      yield chunk;
    }
  };
  if (useS3()) {
    const s3 = await getS3();
    await s3.putGenericObjectStream(key, counter(source));
    return written;
  }
  const p = localPath(key);
  await mkdir(dirname(p), { recursive: true });
  try {
    await pipeline(counter(source), createWriteStream(p));
  } catch (err) {
    await unlink(p).catch(() => {});
    throw err;
  }
  return written;
}

export async function getObjectStream(
  key: string,
  range?: { start: number; end?: number },
): Promise<Readable> {
  assertValidKey(key);
  if (useS3()) {
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

export async function getObjectSize(key: string): Promise<number> {
  assertValidKey(key);
  if (useS3()) {
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
  if (useS3()) {
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
  if (useS3()) {
    const s3 = await getS3();
    await s3.deleteGenericPrefix(prefix);
    return;
  }
  await rm(join(env.WORKSPACE_PATH, prefix), { recursive: true, force: true });
}

export async function listObjects(prefix: string): Promise<ObjectInfo[]> {
  if (!/^(uploads|outputs)\//.test(prefix)) throw new Error(`Invalid prefix: ${prefix}`);
  if (useS3()) {
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
  if (useS3()) {
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
