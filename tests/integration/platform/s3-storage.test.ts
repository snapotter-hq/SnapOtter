/**
 * S3 storage backend integration tests.
 *
 * Tests the full file-storage abstraction layer against a real MinIO instance.
 * Requires MinIO on port 19000:
 *   docker run -d --name snapotter-minio-test -p 19000:9000 \
 *     -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
 *     minio/minio server /data
 */

import { spawnSync } from "node:child_process";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadS3Storage, type S3StorageModule } from "@snapotter/enterprise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const PNG = readFixture(fixtures.image.base.png200);

const S3_ENDPOINT = "http://localhost:19000";
const BUCKET = `snapotter-s3test-${Date.now()}`;
const CREDS = { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" };

const minioAvailable = (() => {
  const result = spawnSync("curl", ["-sf", "http://localhost:19000/minio/health/live"], {
    timeout: 2000,
    stdio: "ignore",
  });
  return result.status === 0;
})();

let s3Client: S3Client;
let s3Storage: S3StorageModule;
let originalStorageMode: string;

async function listKeys(): Promise<string[]> {
  const result = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET }));
  return (result.Contents || []).map((o) => o.Key!);
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!minioAvailable)("S3 storage backend", () => {
  let storedName: string;

  beforeAll(async () => {
    s3Client = new S3Client({
      region: "us-east-1",
      endpoint: S3_ENDPOINT,
      forcePathStyle: true,
      credentials: CREDS,
    });

    await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));

    s3Storage = await loadS3Storage();

    originalStorageMode = env.STORAGE_MODE;
    const e = env as Record<string, unknown>;
    e.STORAGE_MODE = "s3";
    e.S3_BUCKET = BUCKET;
    e.S3_REGION = "us-east-1";
    e.S3_ENDPOINT = S3_ENDPOINT;
    e.S3_ACCESS_KEY_ID = CREDS.accessKeyId;
    e.S3_SECRET_ACCESS_KEY = CREDS.secretAccessKey;
    e.S3_FORCE_PATH_STYLE = true;
    e.S3_PREFIX = "";

    s3Storage.configureS3({
      bucket: BUCKET,
      region: "us-east-1",
      endpoint: S3_ENDPOINT,
      accessKeyId: CREDS.accessKeyId,
      secretAccessKey: CREDS.secretAccessKey,
      forcePathStyle: true,
      prefix: "",
    });
  }, 15_000);

  afterAll(async () => {
    (env as Record<string, unknown>).STORAGE_MODE = originalStorageMode;

    try {
      const objects = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET }));
      if (objects.Contents) {
        for (const obj of objects.Contents) {
          await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key! }));
        }
      }
      await s3Client.send(new DeleteBucketCommand({ Bucket: BUCKET }));
    } catch {
      // Best-effort cleanup
    }
  }, 15_000);

  it("saveFile writes object to S3", async () => {
    const { saveFile } = await import("../../../apps/api/src/lib/file-storage.js");
    storedName = await saveFile(PNG, "test-upload.png");

    expect(storedName).toMatch(/^[a-f0-9-]+\.png$/);
    expect(await objectExists(`files/${storedName}`)).toBe(true);
  });

  it("readStoredFile returns the correct buffer", async () => {
    const { readStoredFile } = await import("../../../apps/api/src/lib/file-storage.js");
    const buffer = await readStoredFile(storedName);
    expect(Buffer.compare(buffer, PNG)).toBe(0);
  });

  it("streamStoredFile returns a readable stream", async () => {
    const { streamStoredFile } = await import("../../../apps/api/src/lib/file-storage.js");
    const stream = await streamStoredFile(storedName);

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.compare(Buffer.concat(chunks), PNG)).toBe(0);
  });

  it("saveThumbnail stores in S3, getCachedThumbnail retrieves it", async () => {
    const { saveThumbnail, getCachedThumbnail } = await import(
      "../../../apps/api/src/lib/file-storage.js"
    );
    const thumbData = Buffer.from("fake-thumbnail-data");

    await saveThumbnail(storedName, thumbData);
    expect(await objectExists(`thumbs/${storedName}.thumb.jpg`)).toBe(true);

    const cached = await getCachedThumbnail(storedName);
    expect(cached).not.toBeNull();
    expect(Buffer.compare(cached!, thumbData)).toBe(0);
  });

  it("deleteThumbnail removes thumbnail from S3", async () => {
    const { deleteThumbnail } = await import("../../../apps/api/src/lib/file-storage.js");
    await deleteThumbnail(storedName);
    expect(await objectExists(`thumbs/${storedName}.thumb.jpg`)).toBe(false);
  });

  it("deleteStoredFile removes file from S3", async () => {
    const { deleteStoredFile } = await import("../../../apps/api/src/lib/file-storage.js");
    await deleteStoredFile(storedName);
    expect(await objectExists(`files/${storedName}`)).toBe(false);
  });

  it("deleteStoredFile is idempotent (no error for missing key)", async () => {
    const { deleteStoredFile } = await import("../../../apps/api/src/lib/file-storage.js");
    await expect(deleteStoredFile("nonexistent-file.png")).resolves.toBeUndefined();
  });

  it("getCachedThumbnail returns null for missing thumbnail", async () => {
    const { getCachedThumbnail } = await import("../../../apps/api/src/lib/file-storage.js");
    expect(await getCachedThumbnail("nonexistent.png")).toBeNull();
  });

  it("S3_PREFIX scopes all object keys under a tenant prefix", async () => {
    const { saveFile, deleteStoredFile } = await import(
      "../../../apps/api/src/lib/file-storage.js"
    );

    (env as Record<string, unknown>).S3_PREFIX = "tenant-123";
    s3Storage.configureS3({
      bucket: BUCKET,
      region: "us-east-1",
      endpoint: S3_ENDPOINT,
      accessKeyId: CREDS.accessKeyId,
      secretAccessKey: CREDS.secretAccessKey,
      forcePathStyle: true,
      prefix: "tenant-123",
    });
    const name = await saveFile(PNG, "prefixed.png");

    expect(await objectExists(`tenant-123/files/${name}`)).toBe(true);
    expect(await objectExists(`files/${name}`)).toBe(false);

    await deleteStoredFile(name);
    expect(await objectExists(`tenant-123/files/${name}`)).toBe(false);

    (env as Record<string, unknown>).S3_PREFIX = "";
    s3Storage.configureS3({
      bucket: BUCKET,
      region: "us-east-1",
      endpoint: S3_ENDPOINT,
      accessKeyId: CREDS.accessKeyId,
      secretAccessKey: CREDS.secretAccessKey,
      forcePathStyle: true,
      prefix: "",
    });
  });

  it("bucket is empty after all operations", async () => {
    const keys = await listKeys();
    expect(keys).toHaveLength(0);
  });
});
