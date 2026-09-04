/**
 * S3-mode tool-result download fault classification (#974).
 *
 * GET /api/v1/download/:jobId/:filename resolved the object with two nested
 * bare catches: any getObjectSize rejection fell through to the uploads/
 * probe, and any rejection there returned 404 "File not found" with no log.
 * On STORAGE_MODE=s3 getObjectSize is a HeadObject call, so AccessDenied,
 * rotated credentials, and S3 5xx all took that path: an S3 outage made
 * every job result look deleted. Sibling of #937 (PR #973), which fixed the
 * library download route.
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
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { putObject } from "../../../apps/api/src/lib/object-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

const S3_ENDPOINT = "http://localhost:19000";
const BUCKET = `snapotter-resfault-${process.pid}-${Date.now()}`;
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

describe.skipIf(!minioAvailable)("S3-mode tool-result download fault classification", () => {
  let testApp: TestApp;
  let adminToken: string;
  let s3Client: S3Client;
  let s3Storage: S3StorageModule;
  let originalStorageMode: string;
  const jobId = `resfault-${process.pid}`;

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

    await putObject(`outputs/${jobId}/result.png`, PNG);

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

  it("downloads a stored result and 404s a genuinely missing one", async () => {
    const ok = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/result.png`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(Buffer.compare(ok.rawPayload, PNG)).toBe(0);

    // HeadObject reports a missing key as "NotFound" (an unmodeled 404),
    // not NoSuchKey; both probes miss and the route must keep its 404.
    const missing = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/download/${jobId}/never-existed.png`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(missing.statusCode).toBe(404);
  });

  // #974: an S3 service fault while resolving the object is a storage
  // outage, not a missing result. It must reach the error handler as a 500
  // instead of presenting every job result as deleted.
  it("returns 500, not 404, when S3 rejects the size probe with an auth fault", async () => {
    s3Storage.configureS3(s3Config({ secretAccessKey: "rotated-away" }));

    try {
      const res = await testApp.app.inject({
        method: "GET",
        url: `/api/v1/download/${jobId}/result.png`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).not.toMatch(/not found/i);
    } finally {
      s3Storage.configureS3(s3Config());
    }
  });
});
