/**
 * Pipeline batch ZIP failure paths.
 *
 * Since #750 the batch-finalize worker packages the ZIP into durable storage
 * before the route responds, so an entry read failure surfaces as a clean
 * error status (nothing was committed to the wire yet) instead of a destroyed
 * mid-stream response. The mid-stream failure surface still exists, but only
 * for the stored ZIP itself: the route commits the 200 header and then
 * streams outputs/<parentId>/<zip>; if that read dies the route must destroy
 * the connection rather than end it cleanly (a clean end of a short body
 * would be indistinguishable from success).
 *
 * Neither branch is reachable through public inputs (the finalize only lists
 * outputs the workers just wrote), so this file swaps getObjectStream for a
 * passthrough that fails ONLY for the designated parent's keys. Workers read
 * inputs from uploads/ keys and the pipeline finalize copy uses
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
  // When set, getObjectStream throws for the per-file output keys
  // (outputs/<id>-f<N>/...) read by the batch-finalize ZIP packaging.
  failEntryStreamsForParentId: null as string | null,
  // When set, getObjectStream throws for the stored batch ZIP itself
  // (outputs/<id>/...), the key the route streams after the finalize.
  failZipObjectForParentId: null as string | null,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    getObjectStream: async (key: string, range?: { start: number; end?: number }) => {
      const entryParent = mocks.failEntryStreamsForParentId;
      if (entryParent && new RegExp(`^outputs/${entryParent}-f\\d+/`).test(key)) {
        throw new Error("simulated object storage outage");
      }
      const zipParent = mocks.failZipObjectForParentId;
      if (zipParent && key.startsWith(`outputs/${zipParent}/`)) {
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
  mocks.failEntryStreamsForParentId = null;
  mocks.failZipObjectForParentId = null;
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

describe("Pipeline batch ZIP delivery", () => {
  it("streams a complete ZIP when object storage is healthy", async () => {
    const res = await postBatch("zip-stream-healthy-parent");

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["x-job-id"]).toBe("zip-stream-healthy-parent");
    // finalize() ran, so the payload carries the end-of-central-directory record
    expect(res.rawPayload.includes(ZIP_EOCD)).toBe(true);
  }, 30_000);

  it("fails with a clean error status when an entry read dies during ZIP packaging", async () => {
    const parentId = "zip-entry-failure-parent";
    mocks.failEntryStreamsForParentId = parentId;

    const res = await postBatch(parentId);

    // The finalize failed before the route committed anything to the wire,
    // so the client gets a real error status and JSON body, not a destroyed
    // 200 stream (#750 moved packaging ahead of the response).
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.rawPayload.includes(ZIP_EOCD)).toBe(false);

    // The failure is durable: the parent row replays a terminal failed frame,
    // which is what settles a client that degraded to the SSE path.
    const sse = await app.inject({
      method: "GET",
      url: `/api/v1/jobs/${parentId}/progress`,
      headers: { authorization: `Bearer ${adminToken}` },
      payloadAsStream: true,
    });
    let terminal: Record<string, unknown> | null = null;
    for await (const chunk of sse.stream()) {
      const text = Buffer.from(chunk).toString();
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = JSON.parse(line.slice(6));
        if (data.type === "batch" && data.status !== "processing") terminal = data;
      }
      if (terminal) break;
    }
    expect(terminal?.status).toBe("failed");
  }, 30_000);

  it("keeps original-index alignment in fileResults across a pre-failed upload", async () => {
    const parentId = "zip-index-alignment-parent";
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "good1.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "file",
        filename: "bad.png",
        content: Buffer.from("not an image"),
        contentType: "image/png",
      },
      { name: "file", filename: "good2.png", content: PNG_200x150, contentType: "image/png" },
      {
        name: "pipeline",
        content: JSON.stringify({ steps: [{ toolId: "resize", settings: { width: 50 } }] }),
      },
      { name: "clientJobId", content: parentId },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/pipeline/batch",
      headers: { "content-type": contentType, authorization: `Bearer ${adminToken}` },
      body,
    });

    expect(res.statusCode).toBe(200);
    // The invalid slot 1 must stay a hole, not shift good2 into it: the
    // finalize maps flow indices back through fileIndexMap (#750).
    const fileResults = JSON.parse(
      decodeURIComponent(res.headers["x-file-results"] as string),
    ) as Record<string, string>;
    expect(Object.keys(fileResults).sort()).toEqual(["0", "2"]);
    expect(fileResults["0"]).toContain("good1");
    expect(fileResults["2"]).toContain("good2");
  }, 30_000);

  it("destroys the connection when the stored ZIP read dies mid-stream", async () => {
    const parentId = "zip-object-failure-parent";
    mocks.failZipObjectForParentId = parentId;

    // The 200 header goes out before the stored ZIP is opened; the poisoned
    // read must then surface as a transport failure (destroyed socket), never
    // as a cleanly-ended short body. app.inject reports that either as a
    // rejected request or as a truncated payload, depending on timing.
    let sawTransportFailure = false;
    let payload: Buffer | null = null;
    try {
      const res = await postBatch(parentId);
      payload = res.rawPayload;
    } catch {
      sawTransportFailure = true;
    }

    if (!sawTransportFailure) {
      expect(payload?.includes(ZIP_EOCD)).toBe(false);
    }
  }, 30_000);
});
