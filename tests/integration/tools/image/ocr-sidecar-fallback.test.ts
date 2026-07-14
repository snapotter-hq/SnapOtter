/**
 * Focused sidecar-free integration coverage for OCR route tier behavior.
 *
 * A request must run exactly the selected tier. Crashes and empty output are
 * never hidden by silently switching engines, and every success reports the
 * actual execution provenance.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureDir, fixtures, readFixture } from "../../../fixtures/index.js";
import { waitForAcceptedJobOrCancel } from "../../settle-job.js";
import {
  buildTestApp,
  createMultipartPayload,
  loginAsAdmin,
  type TestApp,
} from "../../test-server.js";

const mocks = vi.hoisted(() => ({
  extractText: vi.fn(),
  getOcrRuntimeCapability: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    extractText: mocks.extractText,
    getOcrRuntimeCapability: mocks.getOcrRuntimeCapability,
  };
});

const PNG = readFixture(fixtures.image.ocr.clean);
const OCR_FORMAT_FIXTURES = [
  "sample.jpg",
  "sample.png",
  "sample.webp",
  "sample.gif",
  "sample.avif",
  "sample.tiff",
  "sample.bmp",
  "sample.heic",
  "sample.heif",
  "sample.svg",
  "sample.ico",
  "sample.psd",
  "sample.exr",
  "sample.hdr",
  "sample.tga",
  "sample.dng",
  "sample.jxl",
] as const;
const OVERSIZED_QOI_HEADER = (() => {
  const value = Buffer.alloc(14);
  value.write("qoif", 0, "ascii");
  value.writeUInt32BE(10_000, 4);
  value.writeUInt32BE(10_000, 8);
  value[12] = 4;
  return value;
})();

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
  mocks.getOcrRuntimeCapability.mockReset();
  mocks.getOcrRuntimeCapability.mockReturnValue({
    available: true,
    qualities: ["balanced", "best"],
    providers: ["CPUExecutionProvider"],
  });
});

function postOcrFile(
  settings: Record<string, unknown>,
  file: Buffer,
  filename: string,
  token = adminToken,
) {
  const { body, contentType } = createMultipartPayload([
    { name: "file", filename, contentType: "application/octet-stream", content: file },
    { name: "settings", content: JSON.stringify(settings) },
  ]);

  return app.inject({
    method: "POST",
    url: "/api/v1/tools/image/ocr",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": contentType,
    },
    body,
  });
}

function postOcr(settings: Record<string, unknown>, token = adminToken) {
  return postOcrFile(settings, PNG, "ocr-clean.png", token);
}

async function awaitAcceptedOcr(
  response: Awaited<ReturnType<typeof postOcr>>,
): Promise<Record<string, unknown>> {
  expect(response.statusCode).toBe(202);
  const accepted = JSON.parse(response.body) as { jobId?: string; async?: boolean };
  expect(accepted).toMatchObject({ jobId: expect.any(String), async: true });
  const result = await waitForAcceptedJobOrCancel(accepted.jobId as string, "ai", 25_000);
  return (result?.resultPayload ?? {}) as Record<string, unknown>;
}

function postMultipart(url: string, parts: Parameters<typeof createMultipartPayload>[0]) {
  const { body, contentType } = createMultipartPayload(parts);
  return app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${adminToken}`,
      "content-type": contentType,
    },
    body,
  });
}

describe("ocr tier execution coverage", () => {
  it("rejects API keys without tools:use before uploading or enqueueing OCR", async () => {
    const createKey = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "ocr-without-tools", permissions: ["settings:read"] },
    });
    expect(createKey.statusCode).toBe(201);
    const apiKey = JSON.parse(createKey.body).key as string;

    const res = await postOcr({ quality: "fast", language: "en" }, apiKey);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toBe("You don't have permission to use this tool");
    expect(mocks.extractText).not.toHaveBeenCalled();
  });

  it("serializes concurrent requests through the BullMQ AI worker", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.extractText.mockImplementation(async (_input, _scratch, options) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 100));
      active--;
      return {
        text: "SnapOtter OCR",
        engine: "tesseract",
        requestedQuality: options.quality,
        actualQuality: options.quality,
        device: "cpu",
        provider: "tesseract",
        degraded: false,
        warnings: [],
      };
    });

    const [first, second] = await Promise.all([
      postOcr({ quality: "fast", language: "en" }),
      postOcr({ quality: "fast", language: "en" }),
    ]);

    await Promise.all([awaitAcceptedOcr(first), awaitAcceptedOcr(second)]);
    expect(maxActive).toBe(1);
  });

  it.each(
    OCR_FORMAT_FIXTURES,
  )("prepares %s through the real image ingress before mocked recognition", async (fixture) => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: false,
      qualities: [],
      providers: [],
    });
    mocks.extractText.mockImplementationOnce(async (_input, _scratch, options) => ({
      text: "format accepted",
      engine: "tesseract",
      requestedQuality: options.quality,
      actualQuality: options.quality,
      device: "cpu",
      provider: "tesseract",
      degraded: false,
      warnings: [],
    }));

    const response = await postOcrFile(
      { quality: "fast", language: "en" },
      readFileSync(join(fixtureDir.formats, fixture)),
      fixture,
    );
    const result = await awaitAcceptedOcr(response);

    expect(result).toMatchObject({
      text: "format accepted",
      requestedQuality: "fast",
      actualQuality: "fast",
    });
    expect(mocks.extractText).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the selected best runtime crashes", async () => {
    mocks.extractText.mockRejectedValueOnce(new Error("OCR runtime exited unexpectedly"));

    const res = await postOcr({ quality: "best", language: "en", enhance: false });

    await expect(awaitAcceptedOcr(res)).rejects.toThrow("OCR runtime exited unexpectedly");
    expect(mocks.extractText).toHaveBeenCalledTimes(1);
    expect(mocks.extractText.mock.calls[0][2].quality).toBe("best");
  });

  it("returns an empty result without changing the requested tier", async () => {
    mocks.extractText.mockResolvedValueOnce({
      text: "",
      engine: "rapidocr-onnx",
      requestedQuality: "best",
      actualQuality: "best",
      device: "cpu",
      provider: "CPUExecutionProvider",
      degraded: false,
      warnings: [],
      runtimeVersion: "ocr-runtime-1",
      modelVersion: "pp-ocrv6-medium",
    });

    const res = await postOcr({ quality: "best", language: "en" });

    const json = await awaitAcceptedOcr(res);
    expect(mocks.extractText).toHaveBeenCalledTimes(1);
    expect(json).toMatchObject({
      text: "",
      engine: "rapidocr-onnx",
      requestedQuality: "best",
      actualQuality: "best",
      device: "cpu",
      provider: "CPUExecutionProvider",
      degraded: false,
      warnings: [],
      runtimeVersion: "ocr-runtime-1",
      modelVersion: "pp-ocrv6-medium",
    });
  });

  it("returns the optional-pack response before invoking an unavailable accurate tier", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: false,
      qualities: [],
      providers: [],
    });

    const res = await postOcr({ quality: "balanced", language: "en" });

    expect(res.statusCode).toBe(501);
    expect(mocks.extractText).not.toHaveBeenCalled();

    const json = JSON.parse(res.body);
    expect(json).toMatchObject({
      code: "FEATURE_NOT_INSTALLED",
      feature: "ocr",
      requestedQuality: "balanced",
    });
  });

  it("distinguishes an incompatible accurate runtime from a missing pack", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: false,
      status: "incompatible",
      reason: "unsupported-host",
      qualities: [],
      providers: [],
    });

    const res = await postOcr({ quality: "best", language: "en" });

    expect(res.statusCode).toBe(501);
    expect(mocks.extractText).not.toHaveBeenCalled();
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_INCOMPATIBLE",
      feature: "ocr",
      requestedQuality: "best",
      compatibilityReason: "unsupported-host",
    });
  });

  it.each([
    { quality: "fast", language: "ko" },
    { engine: "tesseract", language: "ko" },
  ])("rejects unsupported Fast Korean ingress before OCR execution: %j", async (settings) => {
    const res = await postOcr(settings);

    expect(res.statusCode).toBe(501);
    expect(mocks.extractText).not.toHaveBeenCalled();
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_INCOMPATIBLE",
      feature: "ocr",
      requestedQuality: "fast",
      compatibilityReason: "fast-korean-unsupported",
      guidance:
        "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.",
    });
  });

  it("defaults omitted Korean to Balanced when it is the available accurate tier", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: true,
      qualities: ["balanced"],
      providers: ["CPUExecutionProvider"],
    });
    mocks.extractText.mockResolvedValueOnce({
      text: "한국어",
      engine: "rapidocr-onnx",
      requestedQuality: "balanced",
      actualQuality: "balanced",
      device: "cpu",
      provider: "CPUExecutionProvider",
      degraded: false,
      warnings: [],
    });

    const res = await postOcr({ language: "ko" });

    await awaitAcceptedOcr(res);
    expect(mocks.extractText.mock.calls[0][2]).toMatchObject({
      language: "ko",
      quality: "balanced",
    });
  });

  it("keeps omitted Korean on an accurate tier when the pack is missing", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: false,
      status: "missing",
      reason: "descriptor-missing",
      qualities: [],
      providers: [],
    });

    const res = await postOcr({ language: "ko" });

    expect(res.statusCode).toBe(501);
    expect(mocks.extractText).not.toHaveBeenCalled();
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_NOT_INSTALLED",
      requestedQuality: "best",
      compatibilityReason: "descriptor-missing",
    });
  });

  it.each([
    [
      "/api/v1/tools/image/ocr/batch",
      "settings",
      JSON.stringify({ quality: "fast", language: "ko" }),
    ],
    [
      "/api/v1/pipeline/execute",
      "pipeline",
      JSON.stringify({ steps: [{ toolId: "ocr", settings: { quality: "fast", language: "ko" } }] }),
    ],
    [
      "/api/v1/pipeline/batch",
      "pipeline",
      JSON.stringify({ steps: [{ toolId: "ocr", settings: { quality: "fast", language: "ko" } }] }),
    ],
  ])("rejects Fast Korean before queueing across %s", async (url, field, value) => {
    const res = await postMultipart(url, [
      {
        name: "file",
        filename: "ocr-clean.png",
        contentType: "image/png",
        content: PNG,
      },
      { name: field, content: value },
    ]);

    expect(res.statusCode).toBe(501);
    expect(mocks.extractText).not.toHaveBeenCalled();
    expect(JSON.parse(res.body)).toMatchObject({
      code: "FEATURE_INCOMPATIBLE",
      requestedQuality: "fast",
      compatibilityReason: "fast-korean-unsupported",
      guidance:
        "Fast OCR does not support Korean. Install the Accurate OCR bundle and choose Balanced or Best.",
    });
  });

  it("validates settings before checking the optional pack", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: false,
      qualities: [],
      providers: [],
    });
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
    expect(mocks.getOcrRuntimeCapability).not.toHaveBeenCalled();
    expect(mocks.extractText).not.toHaveBeenCalled();
  });

  it("defaults to Fast when no healthy accurate runtime is active", async () => {
    mocks.getOcrRuntimeCapability.mockReturnValue({
      available: false,
      qualities: [],
      providers: [],
    });
    mocks.extractText.mockResolvedValueOnce({
      text: "SnapOtter OCR",
      engine: "tesseract",
      requestedQuality: "fast",
      actualQuality: "fast",
      device: "cpu",
      provider: "tesseract",
      degraded: false,
      warnings: [],
      runtimeVersion: "5.5.0",
    });

    const res = await postOcr({ language: "en", enhance: false });

    const json = await awaitAcceptedOcr(res);
    expect(mocks.extractText).toHaveBeenCalledTimes(1);
    expect(mocks.extractText.mock.calls[0][2].quality).toBe("fast");
    expect(json).toMatchObject({
      text: "SnapOtter OCR",
      engine: "tesseract",
      requestedQuality: "fast",
      actualQuality: "fast",
      device: "cpu",
      provider: "tesseract",
      degraded: false,
      warnings: [],
    });
  });

  it.each([
    [
      "/api/v1/tools/image/ocr/batch",
      "settings",
      JSON.stringify({ quality: "fast", language: "en" }),
    ],
    [
      "/api/v1/pipeline/execute",
      "pipeline",
      JSON.stringify({ steps: [{ toolId: "ocr", settings: { quality: "fast" } }] }),
    ],
    [
      "/api/v1/pipeline/batch",
      "pipeline",
      JSON.stringify({ steps: [{ toolId: "ocr", settings: { quality: "fast" } }] }),
    ],
  ])("rejects a decoded pixel bomb before %s ingress preprocessing", async (url, field, value) => {
    const res = await postMultipart(url, [
      {
        name: "file",
        filename: "oversized.qoi",
        contentType: "image/qoi",
        content: OVERSIZED_QOI_HEADER,
      },
      { name: field, content: value },
    ]);

    expect([400, 422]).toContain(res.statusCode);
    expect(res.body).toMatch(/40,000,000|pixel safety limit/i);
    expect(mocks.extractText).not.toHaveBeenCalled();
  });
});
