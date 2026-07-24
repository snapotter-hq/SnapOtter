/**
 * Pipeline batch ZIP streaming failure path.
 *
 * The batch route writes the 200 header before it streams ZIP entries from
 * object storage. If a read fails mid-stream the route must abort the archive
 * and end the response instead of hanging the connection. That branch cannot
 * be reached through public inputs (the manifest only lists outputs the worker
 * just wrote), so this file swaps getObjectStream for a passthrough that fails
 * ONLY for the per-file output keys of one designated batch parent id. Workers
 * read inputs from uploads/ keys and the pipeline finalize copy uses
 * getObjectBuffer, so normal processing is untouched.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

const mocks = vi.hoisted(() => ({
  // When set, getObjectStream throws for keys matching outputs/<id>-f<N>/...
  failZipStreamsForParentId: null as string | null,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    getObjectStream: async (key: string, range?: { start: number; end?: number }) => {
      const parentId = mocks.failZipStreamsForParentId;
      if (parentId && new RegExp(`^outputs/${parentId}-f\\d+/`).test(key)) {
        throw new Error("simulated object storage outage");
      }
      return actual.getObjectStream(key, range);
    },
  };
});

const PNG_200x150 = readFixture(fixtures.image.base.png200);

// ZIP end-of-central-directory signature: only written by archive.finalize().
const ZIP_EOCD = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

let testApp: TestApp;
let app: TestApp["app"];
let adminToken: string;

beforeAll(async () => {
  testApp = await buildTestApp();
  app = testApp.app;
  adminToken = await loginAsAdmin(app);
}, 30_000);

afterAll(async () => {
  await testApp.cleanup();
}, 10_000);

afterEach(() => {
  mocks.failZipStreamsForParentId = null;
});

function postBatch(clientJobId: string) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "photo.png", content: PNG_200x150, contentType: "image/png" },
    {
      name: "pipeline",
      content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
    },
    { name: "clientJobId", content: clientJobId },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/pipeline/batch",
    headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
    body,
  });
}

describe("Pipeline batch ZIP streaming", () => {
  it("streams a complete ZIP when object storage is healthy", async () => {
    const res = await postBatch("zip-stream-healthy-parent");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["x-job-id"]).toBe("zip-stream-healthy-parent");
    // finalize() ran, so the payload carries the end-of-central-directory record
    expect(res.rawPayload.includes(ZIP_EOCD)).toBe(true);
  }, 30_000);

  it("aborts the archive and ends the response when an entry read fails", async () => {
    const parentId = "zip-stream-failure-parent";
    mocks.failZipStreamsForParentId = parentId;

    const res = await postBatch(parentId);

    // Headers were already committed before streaming began.
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["x-job-id"]).toBe(parentId);
    // The stream failed before finalize(), so the body must terminate without
    // a complete archive (no end-of-central-directory record), and the
    // request must resolve rather than hang.
    expect(res.rawPayload.includes(ZIP_EOCD)).toBe(false);
  }, 30_000);
});
