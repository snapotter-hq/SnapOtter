/**
 * Focused sidecar-free integration coverage for OCR route fallback behavior.
 *
 * The route retries lower-quality OCR tiers when the Python process crashes or
 * a higher tier returns empty text. These tests mock only the AI bridge and the
 * installation gate so they exercise the Fastify route without running models.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../../fixtures/index.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const mocks = vi.hoisted(() => ({
  extractText: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    extractText: mocks.extractText,
  };
});

vi.mock("../../../../apps/api/src/lib/feature-status.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../apps/api/src/lib/feature-status.js")>();
  return {
    ...actual,
    isToolInstalled: (toolId: string) => (toolId === "ocr" ? true : actual.isToolInstalled(toolId)),
  };
});

const PNG = readFixture(fixtures.image.ocr.clean);

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
  mocks.extractText.mockReset();
});

function postOcr(settings: Record<string, unknown>) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename: "ocr-clean.png", contentType: "image/png", content: PNG },
    { name: "settings", content: JSON.stringify(settings) },
  ]);

  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/ocr",
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

describe("ocr sidecar fallback coverage", () => {
  it("falls back from crashed best tier to empty balanced tier to fast tier", async () => {
    mocks.extractText
      .mockRejectedValueOnce(new Error("Python process exited unexpectedly"))
      .mockResolvedValueOnce({ text: "", engine: "paddleocr-v5" })
      .mockResolvedValueOnce({ text: "SnapOtter OCR", engine: "tesseract" });

    const res = await postOcr({ quality: "best", language: "en", enhance: false });

    expect(res.statusCode).toBe(200);
    expect(mocks.extractText).toHaveBeenCalledTimes(3);
    expect(mocks.extractText.mock.calls.map((call) => call[2].quality)).toEqual([
      "best",
      "balanced",
      "fast",
    ]);

    const json = JSON.parse(res.body);
    expect(json.text).toBe("SnapOtter OCR");
    expect(json.engine).toBe("tesseract");
  });

  it("does not retry non-crash OCR errors", async () => {
    mocks.extractText.mockRejectedValueOnce(new Error("language data missing"));

    const res = await postOcr({ quality: "balanced", language: "en" });

    expect(res.statusCode).toBe(422);
    expect(mocks.extractText).toHaveBeenCalledTimes(1);

    const json = JSON.parse(res.body);
    expect(json.error).toBe("OCR failed");
    expect(json.details).toContain("language data missing");
  });

  it("falls back to a lower tier when PaddleOCR itself is unavailable (e.g. an ABI conflict), instead of hard-failing", async () => {
    // Exact message shapes ocr.py produces on ImportError from run_paddleocr_v5/vl
    // (e.g. "cannot import name '_promote' from 'scipy.spatial.transform._rotation'",
    // the BUG-2 scipy ABI conflict) -- previously matched none of the crash-only
    // substrings below and hard-failed with 422 instead of degrading gracefully.
    mocks.extractText
      .mockRejectedValueOnce(
        new Error(
          "PaddleOCR-VL is not available: cannot import name '_promote' from 'scipy.spatial.transform._rotation'. Install the OCR feature or use quality=balanced for PP-OCRv5.",
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          "PaddleOCR is not installed: cannot import name '_promote' from 'scipy.spatial.transform._rotation'. Install the OCR feature or use quality=fast for Tesseract.",
        ),
      )
      .mockResolvedValueOnce({ text: "SnapOtter OCR", engine: "tesseract" });

    const res = await postOcr({ quality: "best", language: "en", enhance: false });

    expect(res.statusCode).toBe(200);
    expect(mocks.extractText).toHaveBeenCalledTimes(3);
    expect(mocks.extractText.mock.calls.map((call) => call[2].quality)).toEqual([
      "best",
      "balanced",
      "fast",
    ]);

    const json = JSON.parse(res.body);
    expect(json.text).toBe("SnapOtter OCR");
    expect(json.engine).toBe("tesseract");
  });

  it("validates settings after the bundle gate passes", async () => {
    const { body, contentType } = createMultipartPayload([
      { name: "file", filename: "ocr-clean.png", contentType: "image/png", content: PNG },
      { name: "settings", content: JSON.stringify({ quality: "ultra" }) },
    ]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/ocr",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": contentType,
      },
      body,
    });

    expect(res.statusCode).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBe("Invalid settings");
    expect(mocks.extractText).not.toHaveBeenCalled();
  });
});
