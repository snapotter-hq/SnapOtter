/**
 * Per-route coverage for the saveMode multipart field (#495) on the 20
 * hand-written tool routes that honor it. The parse-and-400 gate runs before
 * file and bundle validation, so a lone bogus saveMode field pins each
 * route's field capture and error contract without needing AI bundles.
 *
 * Mirrors ai-async-route-coverage.test.ts: bundle gates forced open and
 * enqueueToolJob mocked so no Python model or worker runs.
 */

import { apiToolPath, LIBRARY_SAVE_MODE_UNSUPPORTED_TOOLS } from "@snapotter/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { INVALID_SAVE_MODE_ERROR } from "../../../apps/api/src/jobs/types.js";
import { fixtures, readFixture } from "../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../test-server.js";

/** Custom routes that parse and forward saveMode. */
const SAVE_MODE_ROUTES = [
  "ai-canvas-expand",
  "auto-subtitles",
  "background-replace",
  "blur-background",
  "blur-faces",
  "colorize",
  "enhance-faces",
  "erase-object",
  "noise-removal",
  "ocr",
  "ocr-pdf",
  "red-eye-removal",
  "remove-background",
  "remove-gif-background",
  "restore-photo",
  "sign-pdf",
  "transcribe-audio",
  "transparency-fixer",
  "upscale",
];

const mocks = vi.hoisted(() => ({
  enqueueToolJob: vi.fn(),
  waitForJob: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    isToolInstalled: () => true,
  };
});

vi.mock("../../../apps/api/src/jobs/enqueue.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/jobs/enqueue.js")>();
  return {
    ...actual,
    enqueueToolJob: mocks.enqueueToolJob,
    waitForJob: mocks.waitForJob,
  };
});

const PDF = readFixture(fixtures.document.pdf2);
const PNG = readFixture(fixtures.image.base.png200);

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

beforeEach(() => {
  mocks.enqueueToolJob.mockReset().mockResolvedValue({});
  mocks.waitForJob.mockReset().mockResolvedValue(null);
});

describe("saveMode 400 gate on custom routes", () => {
  for (const toolId of SAVE_MODE_ROUTES) {
    it(`${toolId} rejects an invalid saveMode with 400`, async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "saveMode", content: "bogus" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: apiToolPath(toolId),
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toBe(INVALID_SAVE_MODE_ERROR);
    });
  }
});

describe("saveMode is ignored by routes outside the feature", () => {
  // Representative custom routes without fileId/saveMode handling: they are
  // listed in LIBRARY_SAVE_MODE_UNSUPPORTED_TOOLS, so the selector never
  // shows for them and a stray saveMode field must not change their errors.
  for (const toolId of ["watermark-image", "edit-metadata"]) {
    it(`${toolId} does not return the saveMode error`, async () => {
      const { body, contentType } = createMultipartPayload([
        { name: "saveMode", content: "bogus" },
      ]);

      const res = await app.inject({
        method: "POST",
        url: apiToolPath(toolId),
        headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
        body,
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      let error: string | undefined;
      try {
        error = JSON.parse(res.body).error;
      } catch {
        // Non-JSON error body is fine; it is certainly not the saveMode error
      }
      expect(error).not.toBe(INVALID_SAVE_MODE_ERROR);
    });
  }
});

describe("custom-client tools participate in the saveMode feature (#565)", () => {
  // Wiring their submitters to send fileId/saveMode means the selector must
  // now show for them, so they must NOT be in the unsupported set.
  for (const toolId of [
    "ocr",
    "erase-object",
    "remove-background",
    "background-replace",
    "blur-background",
  ]) {
    it(`${toolId} is not in LIBRARY_SAVE_MODE_UNSUPPORTED_TOOLS`, () => {
      expect(LIBRARY_SAVE_MODE_UNSUPPORTED_TOOLS.has(toolId)).toBe(false);
    });
  }
});

describe("custom-client routes forward fileId and saveMode into the job", () => {
  it("erase-object forwards the pair", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG },
      { name: "mask", filename: "mask.png", contentType: "image/png", content: PNG },
      { name: "fileId", content: "lib-erase" },
      { name: "saveMode", content: "overwrite" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: apiToolPath("erase-object"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueToolJob.mock.calls[0][0]).toMatchObject({
      toolId: "erase-object",
      fileId: "lib-erase",
      saveMode: "overwrite",
    });
  });

  it("blur-background forwards the pair", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ intensity: 40 }) },
      { name: "fileId", content: "lib-blur" },
      { name: "saveMode", content: "new" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: apiToolPath("blur-background"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueToolJob.mock.calls[0][0]).toMatchObject({
      toolId: "blur-background",
      fileId: "lib-blur",
      saveMode: "new",
    });
  });

  it("background-replace forwards the pair", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ backgroundType: "color", color: "#ffffff" }) },
      { name: "fileId", content: "lib-bgr" },
      { name: "saveMode", content: "overwrite" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: apiToolPath("background-replace"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueToolJob.mock.calls[0][0]).toMatchObject({
      toolId: "background-replace",
      fileId: "lib-bgr",
      saveMode: "overwrite",
    });
  });

  it("ocr forwards the pair", async () => {
    // quality "fast" + a non-Korean language reaches enqueue without any OCR
    // runtime bundle (resolveOcrIngressSettings short-circuits before the gate).
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "img.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: "fast", language: "en" }) },
      { name: "fileId", content: "lib-ocr" },
      { name: "saveMode", content: "new" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: apiToolPath("ocr"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueToolJob.mock.calls[0][0]).toMatchObject({
      toolId: "ocr",
      fileId: "lib-ocr",
      saveMode: "new",
    });
  });
});

describe("sign-pdf saveMode pass-through", () => {
  it("forwards fileId and saveMode into the enqueued job", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "contract.pdf", contentType: "application/pdf", content: PDF },
      {
        name: "placements",
        content: JSON.stringify([{ sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]),
      },
      { name: "sig0", filename: "sig0.png", contentType: "image/png", content: PNG },
      { name: "fileId", content: "lib-contract" },
      { name: "saveMode", content: "overwrite" },
    ]);

    const res = await app.inject({
      method: "POST",
      url: apiToolPath("sign-pdf"),
      headers: { authorization: `Bearer ${adminToken}`, "content-type": contentType },
      body,
    });

    expect(res.statusCode).toBe(202);
    expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueToolJob.mock.calls[0][0]).toMatchObject({
      toolId: "sign-pdf",
      fileId: "lib-contract",
      saveMode: "overwrite",
    });
  });
});
