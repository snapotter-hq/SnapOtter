/**
 * #740: the collage route wrapped its entire processing block in one catch that
 * returned 422 "Collage creation failed" for EVERY error, including an
 * object-storage outage (putObject) or a missing cjxl/ImageMagick binary
 * (encodeJxl). That masked infrastructure failures as bad user input, so users
 * retried forever, and because the error was handled inline the global error
 * handler never ran: no request.log.error, no Sentry event. The fix keeps
 * InputValidationError -> 422 but rethrows everything else so it propagates to
 * the global handler (a 500 with telemetry).
 *
 * The test app (test-server.ts) uses Fastify's default error handling, so a
 * propagated error surfaces here as 500. In production the setErrorHandler at
 * index.ts:350 turns that same propagation into request.log.error + reportError.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

// putObject rejects only while `failPut` is set, so the same app instance can
// serve a normal collage and, on demand, simulate a storage outage.
const storageMock = vi.hoisted(() => ({ failPut: false }));

vi.mock("../../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: async (key: string, body: Buffer) => {
      if (storageMock.failPut) {
        throw new Error("test: object storage is unavailable");
      }
      return actual.putObject(key, body);
    },
  };
});

const PNG = readFixture(fixtures.image.base.png200);
const JPG = readFixture(fixtures.image.base.jpg100);

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
  storageMock.failPut = false;
});

function collageRequest(extra: Record<string, unknown> = {}) {
  const { body, contentType } = createMultipartPayload([
    { name: "f1", filename: "a.png", contentType: "image/png", content: PNG },
    { name: "f2", filename: "b.jpg", contentType: "image/jpeg", content: JPG },
    { name: "settings", content: JSON.stringify({ templateId: "2-h-equal", ...extra }) },
  ]);
  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/collage",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
    body,
  });
}

describe("Collage error visibility (#740)", () => {
  it("surfaces an object-storage failure as a server error, not a 422 masked as bad input", async () => {
    storageMock.failPut = true;

    const res = await collageRequest();

    // Before the fix this returned 422 "Collage creation failed" and never
    // reached the global handler. An infra failure must propagate instead.
    expect(res.statusCode).toBe(500);
  });
});
