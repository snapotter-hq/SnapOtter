/**
 * S3-mode download fault classification (#937).
 *
 * PR #926 taught the local backend to rethrow non-ENOENT storage faults from
 * the download route instead of folding them into 404. The S3 backend still
 * mapped every SDK rejection to 404 "File not found in storage": rotated
 * credentials or a bucket-policy change made the whole library read as
 * deleted. These tests pin the split: an object S3 reports missing stays a
 * 404, a storage service fault surfaces as a 500 for the error handler.
 *
 * Requires MinIO on port 19000 (same harness as s3-storage.test.ts):
 *   docker run -d --name snapotter-minio-test -p 19000:9000 \
 *     -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
 *     minio/minio server /data
 */

import { spawnSync } from "node:child_process";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadS3Storage, type S3StorageModule } from "@snapotter/enterprise";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { db, schema } from "../../../apps/api/src/db/index.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

const S3_ENDPOINT = "http://localhost:19000";
const BUCKET = `snapotter-dlfault-${process.pid}-${Date.now()}`;
const CREDS = { accessKeyId: "minioadmin", secretAccessKey: "minioadmin" };

const minioAvailable = (() => {
  const result = spawnSync("curl", ["-sf", "http://localhost:19000/minio/health/live"], {
    timeout: 2000,
    stdio: "ignore",
  });
  return result.status === 0;
})();

function s3Config(overrides: Partial<Parameters<S3StorageModule["configureS3"]>[0]> = {}) {
  return {
    bucket: BUCKET,
    region: "us-east-1",
    endpoint: S3_ENDPOINT,
    accessKeyId: CREDS.accessKeyId,
    secretAccessKey: CREDS.secretAccessKey,
    forcePathStyle: true,
    prefix: "",
    ...overrides,
  };
}

describe.skipIf(!minioAvailable)("S3-mode download fault classification", () => {
  let testApp: TestApp;
  let adminToken: string;
  let s3Client: S3Client;
  let s3Storage: S3StorageModule;
  let originalStorageMode: string;

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
    s3Storage.configureS3(s3Config());

    testApp = await buildTestApp();
    adminToken = await loginAsAdmin(testApp.app);
  }, 30_000);

  afterAll(async () => {
    (env as Record<string, unknown>).STORAGE_MODE = originalStorageMode;
    try {
      const objects = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET }));
      for (const obj of objects.Contents ?? []) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key! }));
      }
      await s3Client.send(new DeleteBucketCommand({ Bucket: BUCKET }));
    } catch {
      // Best-effort cleanup
    }
    await testApp?.cleanup();
  }, 15_000);

  async function uploadLibraryFile(filename: string): Promise<{ id: string; storedName: string }> {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename, contentType: "image/png", content: PNG },
    ]);
    const res = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/files/upload",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });
    expect(res.statusCode).toBe(201);
    const id = JSON.parse(res.body).files[0].id as string;
    const [row] = await db
      .select({ storedName: schema.userFiles.storedName })
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, id));
    return { id, storedName: row.storedName };
  }

  it("keeps the 404 mapping when S3 reports the object missing", async () => {
    const { id, storedName } = await uploadLibraryFile("s3-gone.png");
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `files/${storedName}` }));

    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${id}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found in storage/i);
  });

  // #937: an S3 service fault (rotated credentials, bucket-policy change,
  // S3 5xx) is a storage outage, not a missing file. It must keep reaching
  // the error handler as a 500, never fold into the missing-blob 404 that
  // presents an outage as everyone's files being deleted.
  it("returns 500, not 404, when S3 rejects the read with an auth fault", async () => {
    const { id } = await uploadLibraryFile("s3-denied.png");
    s3Storage.configureS3(s3Config({ secretAccessKey: "rotated-away" }));

    try {
      const res = await testApp.app.inject({
        method: "GET",
        url: `/api/v1/files/${id}/download`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).not.toMatch(/not found/i);
    } finally {
      s3Storage.configureS3(s3Config());
    }
  });

  // A vanished bucket (deleted, recreated elsewhere, or S3_BUCKET fat-fingered
  // in a config edit) is the same outage class: NoSuchBucket arrives as HTTP
  // 404 but must not read as per-file deletion. Kept last in the file because
  // it destroys the bucket; afterAll tolerates the missing bucket.
  it("returns 500 when the whole bucket is gone", async () => {
    const { id } = await uploadLibraryFile("s3-bucket-gone.png");
    const objects = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET }));
    for (const obj of objects.Contents ?? []) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key! }));
    }
    await s3Client.send(new DeleteBucketCommand({ Bucket: BUCKET }));

    const res = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/files/${id}/download`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).not.toMatch(/not found/i);
  });
});
