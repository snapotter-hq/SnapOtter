/**
 * Local-mode tool-result download fault classification (#974).
 *
 * CI-runnable half of the #974 coverage: the minio-gated
 * s3-result-download-fault.test.ts skips where MinIO is absent (all CI
 * lanes), so the route's classification wiring is pinned here in local mode.
 * A storage fault (EACCES) must reach the error handler as a 500; a key no
 * object can exist at (ENOENT, ENAMETOOLONG, garbage that fails VALID_KEY)
 * keeps its 404 without becoming Sentry noise on this unauthenticated route.
 * The second rethrow site (uploads probe) is the same shared closure applied
 * symmetrically; the fault cases here exercise the outputs site.
 */

import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { deletePrefix, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import { buildTestApp, loginAsAdmin, type TestApp } from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp?.cleanup();
}, 10_000);

async function download(jobId: string, filename: string) {
  return testApp.app.inject({
    method: "GET",
    url: `/api/v1/download/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`,
    headers: { authorization: `Bearer ${adminToken}` },
  });
}

describe("tool-result download fault classification (local mode)", () => {
  it("falls through to the uploads/ prefix when outputs/ has no object", async () => {
    const jobId = "resfault-up";
    await putObject(`uploads/${jobId}/original.png`, PNG);
    try {
      const res = await download(jobId, "original.png");
      expect(res.statusCode).toBe(200);
      expect(Buffer.compare(res.rawPayload, PNG)).toBe(0);
    } finally {
      await deletePrefix(`uploads/${jobId}`);
    }
  });

  // An unreadable job directory is a storage fault (volume UID drift, botched
  // restore), not a missing result. It must stay a 500 that reaches the error
  // handler, never fold into the miss 404 (#974, mirroring the #926 pin for
  // the library route).
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)("returns 500, not 404, when the size probe hits EACCES", async () => {
    const jobId = "resfault-acc";
    await putObject(`outputs/${jobId}/result.png`, PNG);
    const jobDir = join(env.WORKSPACE_PATH, "outputs", jobId);
    await chmod(jobDir, 0o000);
    try {
      const res = await download(jobId, "result.png");
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).not.toMatch(/not found/i);
    } finally {
      await chmod(jobDir, 0o755);
      await deletePrefix(`outputs/${jobId}`);
    }
  });

  // A filename longer than the filesystem allows cannot name a stored object;
  // ENAMETOOLONG is a miss like ENOENT. This route takes unauthenticated
  // client-supplied names, so long garbage must stay 404, not turn into a
  // client-triggerable Sentry event.
  it("keeps 404 for a filename too long for the filesystem", async () => {
    const res = await download("resfault-long", `${"a".repeat(300)}.png`);
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
  });

  // A key that fails VALID_KEY (space in the jobId) must 404 before touching
  // storage. The teeth are in S3 mode: without the pre-check, assertValidKey's
  // plain Error classifies as a storage fault and every scanner probe becomes
  // a 500. The pre-check returns before any storage call, so the bogus S3
  // config set here is never read.
  it("keeps 404 for a key that cannot name a stored object (S3 mode)", async () => {
    const originalMode = env.STORAGE_MODE;
    (env as Record<string, unknown>).STORAGE_MODE = "s3";
    try {
      const res = await download("bad job", "whatever.png");
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body).error).toMatch(/not found/i);
    } finally {
      (env as Record<string, unknown>).STORAGE_MODE = originalMode;
    }
  });
});
