/**
 * Integration tests for the erase-object multipart contract
 * (/api/v1/tools/image/erase-object).
 *
 * Every AI-matrix test stops at the 501 FEATURE_NOT_INSTALLED guard, so the
 * file+mask parse path behind it had no coverage. These tests mock the
 * install gate open and replay the exact multipart shape the web client
 * sends. The AI sidecar is not running in tests, so a successful parse
 * yields 202 (job enqueued); any 4xx means the request was misparsed.
 */

import { randomUUID } from "node:crypto";
import { Agent as HttpAgent, request as httpRequest } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

vi.mock("../../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const mod =
    await importOriginal<typeof import("../../../../apps/api/src/lib/feature-status.js")>();
  return { ...mod, isToolInstalled: () => true };
});

const JPG = readFixture(fixtures.image.base.jpg100);
const PNG = readFixture(fixtures.image.base.png200);
// Large first file: widens the window in which the request stream fully
// buffers (firing "close") while the first part is still streaming to
// storage, which is what dropped the trailing mask part.
const LARGE_JPG = readFixture(fixtures.image.stressLarge);

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

describe("erase-object multipart contract", () => {
  it("accepts the web client's file + mask + fields shape", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: JPG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: PNG },
      { name: "clientJobId", content: randomUUID() },
      { name: "format", content: "png" },
      { name: "quality", content: "95" },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/erase-object",
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      payload: body,
    });
    expect(res.statusCode, res.body).toBeLessThan(400);
  });

  it("keeps trailing parts across reused keep-alive connections", async () => {
    // Regression for the @fastify/multipart parts() race: its iterator ends
    // on the REQUEST stream's "close", which on a warm keep-alive connection
    // fires while the first file is still streaming to storage, dropping the
    // trailing mask part. inject() cannot reproduce it (no real socket), so
    // this test runs real sequential HTTP posts over one connection. Before
    // the busboy-driven iterator fix, the second post reliably 400'd with
    // "No mask image provided".
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    const agent = new HttpAgent({ keepAlive: true, maxSockets: 1 });

    const post = (): Promise<{ status: number; body: string }> =>
      new Promise((resolve, reject) => {
        const { body, contentType } = createMultipartPayload([
          { name: "file", filename: "photo.jpg", contentType: "image/jpeg", content: LARGE_JPG },
          { name: "mask", filename: "mask.png", contentType: "image/png", content: PNG },
          { name: "clientJobId", content: randomUUID() },
          { name: "format", content: "png" },
          { name: "quality", content: "95" },
        ]);
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port,
            path: "/api/v1/tools/image/erase-object",
            method: "POST",
            agent,
            headers: {
              authorization: `Bearer ${adminToken}`,
              "content-type": contentType,
              "content-length": body.length,
            },
          },
          (res) => {
            let text = "";
            res.on("data", (chunk) => {
              text += chunk;
            });
            res.on("end", () => resolve({ status: res.statusCode ?? 0, body: text }));
          },
        );
        req.on("error", reject);
        req.end(body);
      });

    try {
      const results = [await post(), await post(), await post()];
      for (const [i, r] of results.entries()) {
        expect(r.status, `request ${i + 1} of 3: ${r.body}`).toBeLessThan(400);
      }
    } finally {
      agent.destroy();
    }
  }, 30_000);
});
