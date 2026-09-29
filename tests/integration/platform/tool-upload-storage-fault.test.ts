/**
 * A storage fault while a tool upload streams in is the server's, not a
 * malformed request (#1421). The workspace cap, the disk floor, a full or
 * read-only volume and an S3 outage all used to come back as 400 "Failed to
 * parse multipart request", with their 503 status and `code` thrown away, so
 * the batch client couldn't tell "wait for space" from "your file is broken"
 * and nothing reached Sentry.
 *
 * This fills the workspace past a one-byte cap and uploads to a factory
 * tool. The test app doesn't install plugins/error-handler.ts, so the body is
 * Fastify's default shape ({ statusCode, code, error, message }); in
 * production the handler puts the SafeError's message under `error`, keeps
 * its `code`, and reports it (tests/unit/api/error-handler.test.ts).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import { deletePrefix, putObject } from "../../../apps/api/src/lib/object-storage.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const PNG = readFixture(fixtures.image.base.png200);

let testApp: TestApp;
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  adminToken = await loginAsAdmin(testApp.app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

function resizeUpload() {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "a.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify({ width: 50 }) },
  ]);
  return testApp.app.inject({
    method: "POST",
    url: "/api/v1/tools/image/resize",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    payload: body,
  });
}

describe("a storage fault during a tool upload (#1421)", () => {
  it("answers 503 with the workspace-cap code, not a 400 parse failure", async () => {
    const seed = `uploads/${randomUUID()}/`;
    const originalCap = env.MAX_WORKSPACE_SIZE_GB;
    // Something in the workspace, a one-byte cap, and the 30-second size
    // cache cleared (a delete clears it), so the upload's capacity check sees
    // the workspace as full.
    await putObject(`${seed}seed.bin`, Buffer.alloc(1024, 1));
    await deletePrefix(`uploads/${randomUUID()}/`);
    (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = 1 / 1024 ** 3;
    try {
      const res = await resizeUpload();

      expect(res.statusCode, res.body).toBe(503);
      const body = JSON.parse(res.body) as Record<string, unknown>;
      expect(body.code).toBe("workspace-cap");
      expect(body.message).toMatch(/Workspace storage limit reached/);
      expect(res.body).not.toMatch(/Failed to parse multipart request/);
    } finally {
      (env as { MAX_WORKSPACE_SIZE_GB: number }).MAX_WORKSPACE_SIZE_GB = originalCap;
      await deletePrefix(seed);
    }
  });

  it("still processes the same upload once there is room", async () => {
    const res = await resizeUpload();
    expect(res.statusCode, res.body).toBe(200);
  });
});
