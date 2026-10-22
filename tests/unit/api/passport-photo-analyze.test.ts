import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import { SafeError } from "@snapotter/shared";
import Fastify from "fastify";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBenchmarkResponse } from "../../benchmark/lib/job-aware.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const detectFaceLandmarks = vi.fn();
const removeBackground = vi.fn();
const putObject = vi.fn();
const dbInsertValues = vi.fn();
const updateSingleFileProgress = vi.fn();
const withRouteScratchSpy = vi.fn();
const autoOrient = vi.fn();

vi.mock("../../../apps/api/src/lib/route-scratch.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/route-scratch.js")>();
  return {
    ...actual,
    withRouteScratch: (...args: Parameters<typeof actual.withRouteScratch>) => {
      withRouteScratchSpy(...args);
      return actual.withRouteScratch(...args);
    },
  };
});

vi.mock("@snapotter/ai", () => ({
  detectFaceLandmarks: (...args: unknown[]) => detectFaceLandmarks(...args),
  removeBackground: (...args: unknown[]) => removeBackground(...args),
}));

vi.mock("../../../apps/api/src/lib/auto-orient.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/auto-orient.js")>();
  return {
    ...actual,
    autoOrient: (...args: Parameters<typeof actual.autoOrient>) => autoOrient(...args),
  };
});

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  getFirstMissingBundleForTool: () => null,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: (...args: unknown[]) => putObject(...args),
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => dbInsertValues(...args),
    }),
  },
  schema: {
    jobs: {},
  },
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  updateSingleFileProgress: (...args: unknown[]) => updateSingleFileProgress(...args),
}));

import { DecoderUnavailableError } from "../../../apps/api/src/lib/format-decoders.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { registerPassportPhoto } from "../../../apps/api/src/routes/tools/passport-photo.js";

const SAMPLE_LANDMARKS = {
  leftEye: { x: 0.35, y: 0.4 },
  rightEye: { x: 0.65, y: 0.4 },
  eyeCenter: { x: 0.5, y: 0.4 },
  chin: { x: 0.5, y: 0.8 },
  forehead: { x: 0.5, y: 0.25 },
  crown: { x: 0.5, y: 0.15 },
  nose: { x: 0.5, y: 0.55 },
  faceCenterX: 0.5,
};

let validPng: Buffer;

beforeAll(async () => {
  validPng = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 120, g: 140, b: 160, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
});

function buildAnalyzeMultipart(png: Buffer, clientJobId?: string) {
  const boundary = "----passport-analyze-test";
  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="portrait.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    png,
    Buffer.from("\r\n"),
  ];
  if (clientJobId !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="clientJobId"\r\n\r\n${clientJobId}\r\n`,
      ),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("POST /api/v1/tools/image/passport-photo/analyze cleanup and progress settlement (#2577)", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    detectFaceLandmarks.mockReset();
    removeBackground.mockReset();
    putObject.mockReset().mockResolvedValue(undefined);
    dbInsertValues.mockReset().mockResolvedValue(undefined);
    updateSingleFileProgress.mockReset().mockResolvedValue(undefined);
    withRouteScratchSpy.mockReset();
    autoOrient.mockReset().mockImplementation(async (buf: Buffer) => buf);

    app = Fastify();
    await app.register(multipart);
    registerErrorHandler(app);
    registerPassportPhoto(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("settles clientJobId to failed and avoids scratchDir and uploads writes when detectFaceLandmarks throws", async () => {
    detectFaceLandmarks.mockRejectedValueOnce(
      new Error("passport-photo needs about 2.5 GB free on CPU hosts, this host has 1.2 GB"),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-landmark-fail"),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: "Passport photo analysis failed",
      details: "passport-photo needs about 2.5 GB free on CPU hosts, this host has 1.2 GB",
    });

    expect(withRouteScratchSpy).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(updateSingleFileProgress).toHaveBeenCalledWith({
      jobId: "client-job-landmark-fail",
      phase: "failed",
      percent: 0,
      error: "passport-photo needs about 2.5 GB free on CPU hosts, this host has 1.2 GB",
    });
  });

  it("does not leak scratchDir or write uploads/ when no face is detected", async () => {
    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: false,
      imageWidth: 32,
      imageHeight: 32,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-no-face"),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("No face detected");
    expect(withRouteScratchSpy).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(removeBackground).not.toHaveBeenCalled();
    expect(updateSingleFileProgress).toHaveBeenCalledWith({
      jobId: "client-job-no-face",
      phase: "complete",
      percent: 100,
      result: { jobId: expect.any(String), faceDetected: false },
    });

    const jobId = updateSingleFileProgress.mock.calls[0]?.[0]?.result?.jobId as string;
    expect(existsSync(join(tmpdir(), "snapotter-scratch", jobId))).toBe(false);
  });

  it("scopes scratchDir around removeBackground and settles clientJobId to failed when removeBackground throws", async () => {
    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: true,
      landmarks: SAMPLE_LANDMARKS,
      imageWidth: 32,
      imageHeight: 32,
    });
    let observedScratchDir = "";
    let scratchExistedDuringCall = false;
    removeBackground.mockImplementationOnce(async (_buf: Buffer, scratchDir: string) => {
      observedScratchDir = scratchDir;
      scratchExistedDuringCall = existsSync(scratchDir);
      throw new Error("birefnet-portrait inference failed");
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-rembg-fail"),
    });

    expect(res.statusCode).toBe(422);
    expect(scratchExistedDuringCall).toBe(true);
    expect(existsSync(observedScratchDir)).toBe(false);
    expect(putObject).not.toHaveBeenCalled();
    expect(updateSingleFileProgress).toHaveBeenCalledWith({
      jobId: "client-job-rembg-fail",
      phase: "failed",
      percent: 0,
      error: "birefnet-portrait inference failed",
    });
  });

  it("settles clientJobId to failed before rethrowing DecoderUnavailableError", async () => {
    autoOrient.mockRejectedValueOnce(new DecoderUnavailableError("heif", "heif-dec"));

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-decoder-503"),
    });

    expect(res.statusCode).toBe(503);
    expect(withRouteScratchSpy).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
    expect(updateSingleFileProgress).toHaveBeenCalledWith({
      jobId: "client-job-decoder-503",
      phase: "failed",
      percent: 0,
      error: expect.stringContaining("heif"),
    });
  });

  it("settles clientJobId to failed before rethrowing a 503 storage error", async () => {
    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: true,
      landmarks: SAMPLE_LANDMARKS,
      imageWidth: 32,
      imageHeight: 32,
    });
    removeBackground.mockResolvedValueOnce(validPng);
    putObject.mockRejectedValueOnce(
      new SafeError("Storage unavailable.", { statusCode: 503, code: "STORAGE_UNAVAILABLE" }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-storage-503"),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("STORAGE_UNAVAILABLE");
    expect(updateSingleFileProgress).toHaveBeenCalledWith({
      jobId: "client-job-storage-503",
      phase: "failed",
      percent: 0,
      error: "Storage unavailable.",
    });
  });

  it("redacts raw 5xx error messages when settling clientJobId before rethrowing", async () => {
    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: true,
      landmarks: SAMPLE_LANDMARKS,
      imageWidth: 32,
      imageHeight: 32,
    });
    removeBackground.mockResolvedValueOnce(validPng);
    putObject.mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied, open '/data/outputs/secret.png'"), {
        statusCode: 500,
      }),
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-raw-500"),
    });

    expect(res.statusCode).toBe(500);
    expect(updateSingleFileProgress).toHaveBeenCalledWith({
      jobId: "client-job-raw-500",
      phase: "failed",
      percent: 0,
      error: "Passport photo analysis failed",
    });
  });

  it("still returns 200, 422, or 503 when terminal updateSingleFileProgress rejects", async () => {
    updateSingleFileProgress.mockRejectedValue(new Error("db connection lost"));

    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: false,
      imageWidth: 32,
      imageHeight: 32,
    });
    const noFaceRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-persist-no-face"),
    });
    expect(noFaceRes.statusCode).toBe(422);
    expect(noFaceRes.json().error).toBe("No face detected");

    detectFaceLandmarks.mockRejectedValueOnce(new Error("face model error"));
    const failRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-persist-fail"),
    });
    expect(failRes.statusCode).toBe(422);
    expect(failRes.json()).toEqual({
      error: "Passport photo analysis failed",
      details: "face model error",
    });

    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: true,
      landmarks: SAMPLE_LANDMARKS,
      imageWidth: 32,
      imageHeight: 32,
    });
    removeBackground.mockResolvedValueOnce(validPng);
    putObject.mockRejectedValueOnce(
      new SafeError("Storage unavailable.", { statusCode: 503, code: "STORAGE_UNAVAILABLE" }),
    );
    const storageRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-persist-503"),
    });
    expect(storageRes.statusCode).toBe(503);
    expect(storageRes.json().code).toBe("STORAGE_UNAVAILABLE");

    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: true,
      landmarks: SAMPLE_LANDMARKS,
      imageWidth: 32,
      imageHeight: 32,
    });
    removeBackground.mockResolvedValueOnce(validPng);
    const okRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-persist-ok"),
    });
    expect(okRes.statusCode).toBe(200);
  });

  it("writes only outputs/<jobId>/<stem>_nobg.png on success and never writes uploads/", async () => {
    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: true,
      landmarks: SAMPLE_LANDMARKS,
      imageWidth: 32,
      imageHeight: 32,
    });
    let observedScratchDir = "";
    removeBackground.mockImplementationOnce(async (_buf: Buffer, scratchDir: string) => {
      observedScratchDir = scratchDir;
      return validPng;
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng, "client-job-ok"),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(existsSync(observedScratchDir)).toBe(false);
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(putObject).toHaveBeenCalledWith(`outputs/${body.jobId}/portrait_nobg.png`, validPng);
    expect(dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: body.jobId,
        toolId: "passport-photo",
        type: "single",
        status: "completed",
        outputRefs: [`outputs/${body.jobId}/portrait_nobg.png`],
      }),
    );
    expect(updateSingleFileProgress).toHaveBeenCalledWith({
      jobId: "client-job-ok",
      phase: "complete",
      percent: 100,
      result: { jobId: body.jobId, faceDetected: true },
    });
  });

  it("records the analysing user as the owner generate checks, before storing the cutout", async () => {
    await app.close();
    app = Fastify();
    app.addHook("onRequest", async (req) => {
      (req as typeof req & { user?: unknown }).user = { id: "analyst-1" };
    });
    await app.register(multipart);
    registerErrorHandler(app);
    registerPassportPhoto(app);
    await app.ready();
    detectFaceLandmarks.mockResolvedValueOnce({
      faceDetected: true,
      landmarks: SAMPLE_LANDMARKS,
      imageWidth: 32,
      imageHeight: 32,
    });
    removeBackground.mockResolvedValueOnce(validPng);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo/analyze",
      ...buildAnalyzeMultipart(validPng),
    });

    expect(res.statusCode).toBe(200);
    expect(dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ id: res.json().jobId, userId: "analyst-1" }),
    );
    // The row goes in first, so a failed insert never leaves a rowless cutout.
    expect(dbInsertValues.mock.invocationCallOrder[0]).toBeLessThan(
      putObject.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("bench-ai.sh posts passport-photo to /analyze and resolves a 200 benchmark response (#3000)", async () => {
    const benchAi = readFileSync(join(REPO_ROOT, "tests/benchmark/bench-ai.sh"), "utf8");
    const passportCalls = [
      ...benchAi.matchAll(/bench_ai_tool\s+"(image\/passport-photo[^"]*)"/g),
    ].map((match) => match[1]);

    expect(passportCalls.length).toBeGreaterThan(0);

    const baseRes = await app.inject({
      method: "POST",
      url: "/api/v1/tools/image/passport-photo",
      ...buildAnalyzeMultipart(validPng),
    });
    expect(baseRes.statusCode).toBe(400);
    expect(baseRes.json()).toEqual({
      error: "Use /api/v1/tools/image/passport-photo/analyze or /generate",
    });
    await expect(
      resolveBenchmarkResponse({
        baseUrl: "http://localhost:1349",
        admissionStatus: baseRes.statusCode,
        admissionMime: baseRes.headers["content-type"],
        admissionBody: baseRes.rawPayload,
        expectedMime: undefined,
        expectedZipEntries: undefined,
        oracle: undefined,
      }),
    ).rejects.toThrow(/admission returned HTTP 400/);

    for (const toolPath of passportCalls) {
      expect(toolPath).toBe("image/passport-photo/analyze");

      detectFaceLandmarks.mockResolvedValueOnce({
        faceDetected: true,
        landmarks: SAMPLE_LANDMARKS,
        imageWidth: 32,
        imageHeight: 32,
      });
      removeBackground.mockResolvedValueOnce(validPng);

      const res = await app.inject({
        method: "POST",
        url: `/api/v1/tools/${toolPath}`,
        ...buildAnalyzeMultipart(validPng),
      });

      expect(res.statusCode).toBe(200);
      const resolved = await resolveBenchmarkResponse({
        baseUrl: "http://localhost:1349",
        admissionStatus: res.statusCode,
        admissionMime: res.headers["content-type"],
        admissionBody: res.rawPayload,
        expectedMime: undefined,
        expectedZipEntries: undefined,
        oracle: undefined,
      });
      expect(resolved.completionStatus).toBe("completed");
      expect(resolved.outputMime).toBe("application/json");
    }
  });
});
