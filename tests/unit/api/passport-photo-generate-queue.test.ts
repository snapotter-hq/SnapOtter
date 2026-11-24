/**
 * #4337: passport-photo's generate step used to crop inside the HTTP request,
 * with no job row, progress, or cancel. It now queues a BullMQ job like the
 * factory tools: 200 with the result inside the sync window, 202 with the job
 * id after it. The analyzed cutout travels as the job's own input object, and
 * the crop runs from a direct-only process fn rather than the pipeline fn,
 * which would detect the face and remove the background all over again.
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PASSPORT_SPECS, SafeError, ToolInputError } from "@snapotter/shared";
import Fastify from "fastify";
import sharp, { type Sharp } from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jobRows = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve(jobRows.rows),
      }),
    })),
  },
  schema: { settings: {}, jobs: { id: {}, status: {}, error: {}, userId: {}, type: {} } },
}));

vi.mock("../../../apps/api/src/lib/settings-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/settings-helpers.js")>()),
  getSettingStrict: vi.fn(async () => "0"),
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: vi.fn(async () => ({})),
  insertToolJobAlias: vi.fn(async () => true),
  waitForJob: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  putObject: vi.fn(async () => {}),
  getObjectBuffer: vi.fn(),
  deletePrefix: vi.fn(async () => {}),
}));

vi.mock("../../../apps/api/src/lib/upload-cleanup.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/upload-cleanup.js")>()),
  settleUnenqueuedAlias: vi.fn(async () => {}),
}));

vi.mock("../../../apps/api/src/lib/audit.js", () => ({
  isToolAuditEnabled: vi.fn(async () => false),
  auditFromRequest: vi.fn(() => vi.fn()),
}));

vi.mock("../../../apps/api/src/lib/logger.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/logger.js")>();
  return { ...actual, logger: { ...actual.logger, error: vi.fn(), info: vi.fn() } };
});

import {
  enqueueToolJob,
  insertToolJobAlias,
  waitForJob,
} from "../../../apps/api/src/jobs/enqueue.js";
import type { ToolJobData } from "../../../apps/api/src/jobs/types.js";
import { selectJobDispatch } from "../../../apps/api/src/jobs/worker.js";
import { logger } from "../../../apps/api/src/lib/logger.js";
import {
  deletePrefix,
  getObjectBuffer,
  putObject,
} from "../../../apps/api/src/lib/object-storage.js";
import { settleUnenqueuedAlias } from "../../../apps/api/src/lib/upload-cleanup.js";
import { registerErrorHandler } from "../../../apps/api/src/plugins/error-handler.js";
import { getDirectJobProcessFn, getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import {
  processPassportGenerate,
  registerPassportPhoto,
} from "../../../apps/api/src/routes/tools/passport-photo.js";

const URL_PATH = "/api/v1/tools/image/passport-photo/generate";

// A plausible face on a 200x200 background-removed image, so the crop maths
// lands inside the canvas.
const landmarks = {
  leftEye: { x: 0.42, y: 0.45 },
  rightEye: { x: 0.58, y: 0.45 },
  eyeCenter: { x: 0.5, y: 0.45 },
  chin: { x: 0.5, y: 0.7 },
  forehead: { x: 0.5, y: 0.32 },
  crown: { x: 0.5, y: 0.25 },
  nose: { x: 0.5, y: 0.55 },
  faceCenterX: 0.5,
};
const body = {
  jobId: "analyze-job",
  filename: "face.png",
  countryCode: "US",
  landmarks,
  imageWidth: 200,
  imageHeight: 200,
};

const cutout = () =>
  sharp({ create: { width: 200, height: 200, channels: 4, background: "#fff" } })
    .png()
    .toBuffer();

async function buildApp() {
  const app = Fastify();
  registerErrorHandler(app);
  registerPassportPhoto(app);
  await app.ready();
  return app;
}

function enqueued(): ToolJobData {
  const calls = vi.mocked(enqueueToolJob).mock.calls;
  expect(calls).toHaveLength(1);
  return calls[0][0] as ToolJobData;
}

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

beforeEach(async () => {
  vi.clearAllMocks();
  jobRows.rows = [];
  const png = await cutout();
  vi.mocked(getObjectBuffer).mockResolvedValue(png);
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("passport-photo generate route queues a job (#4337)", () => {
  it("copies the analyzed cutout into the job's own uploads and enqueues it on the image pool", async () => {
    vi.mocked(waitForJob).mockResolvedValue({
      outputRefs: ["outputs/x/face_passport.jpg"],
      filename: "face_passport.jpg",
      contentType: "image/jpeg",
      originalSize: 10,
      processedSize: 8,
      resultPayload: { dimensions: { widthPx: 600 }, spec: { countryCode: "US" } },
    } as never);
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: URL_PATH, payload: body });

    expect(res.statusCode, res.body).toBe(200);
    expect(getObjectBuffer).toHaveBeenCalledWith("outputs/analyze-job/face_nobg.png");
    const job = enqueued();
    // A fresh id: Phase 2 never writes into the client-chosen Phase 1 prefix.
    expect(job.jobId).not.toBe("analyze-job");
    expect(job).toMatchObject({
      toolId: "passport-photo",
      kind: "tool",
      pool: "image",
      filename: "face_nobg.png",
      inputRefs: [`uploads/${job.jobId}/face_nobg.png`],
    });
    expect(job.settings).not.toHaveProperty("jobId");
    expect(job.settings).not.toHaveProperty("clientJobId");
    expect(job.settings).toMatchObject({ filename: "face.png", countryCode: "US", landmarks });
    expect(putObject).toHaveBeenCalledWith(
      `uploads/${job.jobId}/face_nobg.png`,
      expect.any(Buffer),
    );
    // Analyze's own output stays put so the user can generate again.
    expect(deletePrefix).not.toHaveBeenCalled();
    expect(res.json()).toMatchObject({
      jobId: job.jobId,
      downloadUrl: `/api/v1/download/${job.jobId}/face_passport.jpg`,
      dimensions: { widthPx: 600 },
      spec: { countryCode: "US" },
    });
  });

  it("answers 202 with the job id when the sync window runs out", async () => {
    vi.mocked(waitForJob).mockResolvedValue(null as never);
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { ...body, clientJobId: "client-run-1" },
    });

    expect(res.statusCode, res.body).toBe(202);
    const job = enqueued();
    expect(job.clientJobId).toBe("client-run-1");
    expect(insertToolJobAlias).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: job.jobId, clientJobId: "client-run-1", pool: "image" }),
    );
    expect(res.json()).toEqual({
      jobId: "client-run-1",
      progressJobId: "client-run-1",
      artifactJobId: job.jobId,
      async: true,
      statusUrl: "/api/v1/jobs/client-run-1",
      progressUrl: "/api/v1/jobs/client-run-1/progress",
    });
  });

  it("answers the status, details and code the failed job's row carries", async () => {
    vi.mocked(waitForJob).mockRejectedValue(new Error("Passport photo generation failed"));
    jobRows.rows = [
      {
        status: "failed",
        error: {
          message: "Passport photo generation failed",
          httpStatus: 422,
          details: "Couldn't get this photo under 1 KB",
          code: "TARGET_SIZE_UNREACHABLE",
        },
      },
    ];
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: URL_PATH, payload: body });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      error: "Passport photo generation failed",
      details: "Couldn't get this photo under 1 KB",
      code: "TARGET_SIZE_UNREACHABLE",
      requestId: expect.any(String),
    });
  });

  it("rejects bad settings, a bad clientJobId and an unknown country before reading or queueing", async () => {
    app = await buildApp();
    const bad = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { ...body, landmarks: undefined },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("Invalid settings");

    const badId = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { ...body, clientJobId: "../escape" },
    });
    expect(badId.statusCode).toBe(400);

    const country = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { ...body, countryCode: "ZZ" },
    });
    expect(country.statusCode).toBe(400);
    expect(country.json().error).toBe("Unknown country code: ZZ");

    expect(getObjectBuffer).not.toHaveBeenCalled();
    expect(enqueueToolJob).not.toHaveBeenCalled();
    expect(putObject).not.toHaveBeenCalled();
  });

  it("answers 410 ANALYSIS_EXPIRED without queueing when the cutout is gone", async () => {
    vi.mocked(getObjectBuffer).mockRejectedValue(
      Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" }),
    );
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: URL_PATH, payload: body });

    expect(res.statusCode).toBe(410);
    expect(res.json().code).toBe("ANALYSIS_EXPIRED");
    expect(enqueueToolJob).not.toHaveBeenCalled();
  });

  it("discards the copied input and settles the alias when the copy fails", async () => {
    vi.mocked(putObject).mockRejectedValueOnce(
      new SafeError("Storage unavailable.", { statusCode: 503, code: "STORAGE_UNAVAILABLE" }),
    );
    app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: URL_PATH,
      payload: { ...body, clientJobId: "client-run-2" },
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("STORAGE_UNAVAILABLE");
    expect(enqueueToolJob).not.toHaveBeenCalled();
    expect(deletePrefix).toHaveBeenCalledWith(expect.stringMatching(/^uploads\/[0-9a-f-]+\/$/));
    expect(settleUnenqueuedAlias).toHaveBeenCalledWith(
      expect.any(String),
      "client-run-2",
      expect.anything(),
    );
  });
});

describe("passport-photo generate job process fn", () => {
  const ctx = async (settings: Record<string, unknown>, buffer?: Buffer) => ({
    jobId: "job-42",
    inputs: [
      {
        buffer: buffer ?? (await cutout()),
        filename: "face_nobg.png",
        ref: "uploads/job-42/face_nobg.png",
      },
    ],
    settings: {
      filename: "face.png",
      countryCode: "US",
      landmarks,
      imageWidth: 200,
      imageHeight: 200,
      ...settings,
    },
    scratchDir: "/tmp/unused",
    signal: new AbortController().signal,
    report: vi.fn(),
  });

  it("crops to the document's pixel size and reports its spec", async () => {
    const us = PASSPORT_SPECS.find((s) => s.code === "US")?.documents[0];
    expect(us).toBeDefined();
    const result = await processPassportGenerate(await ctx({}));

    expect(result.filename).toBe("face_passport.jpg");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.extraOutputs).toBeUndefined();
    const widthPx = Math.round(((us?.width ?? 0) / 25.4) * 300);
    const heightPx = Math.round(((us?.height ?? 0) / 25.4) * 300);
    const meta = await sharp(result.buffer).metadata();
    expect([meta.width, meta.height]).toEqual([widthPx, heightPx]);
    expect(result.resultPayload).toEqual({
      dimensions: { widthMm: us?.width, heightMm: us?.height, widthPx, heightPx, dpi: 300 },
      spec: {
        country: "United States",
        countryCode: "US",
        documentType: us?.type,
        documentLabel: us?.label,
      },
    });
    expect(result.resultPayload).not.toHaveProperty("printDownloadUrl");
  });

  it("returns the print sheet as an extra output linked under the job's own id", async () => {
    const result = await processPassportGenerate(await ctx({ printLayout: "4x6" }));

    expect(result.extraOutputs).toEqual([
      {
        name: "face_passport_print_4x6.jpg",
        buffer: expect.any(Buffer),
        contentType: "image/jpeg",
      },
    ]);
    expect(result.resultPayload?.printDownloadUrl).toBe(
      "/api/v1/download/job-42/face_passport_print_4x6.jpg",
    );
  });

  it("answers 422 with the reason and code when the size cap can't be met", async () => {
    await expect(processPassportGenerate(await ctx({ maxFileSizeKb: 0.01 }))).rejects.toMatchObject(
      {
        name: "InputValidationError",
        message: "Passport photo generation failed",
        statusCode: 422,
        details: expect.stringContaining("Couldn't get this photo under"),
        code: "TARGET_SIZE_UNREACHABLE",
      },
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("answers 422 with server paths masked and logs a processing failure", async () => {
    const tempPath = join(tmpdir(), "snapotter-scratch", "passport-4337.png");
    const input = await ctx({});
    const spy = vi.spyOn(sharp.prototype, "png").mockImplementationOnce(function (this: Sharp) {
      throw new Error(`vips write failed at ${tempPath}`);
    });
    try {
      await expect(processPassportGenerate(input)).rejects.toMatchObject({
        name: "InputValidationError",
        message: "Passport photo generation failed",
        statusCode: 422,
        details: "vips write failed at [internal]",
      });
    } finally {
      spy.mockRestore();
    }
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: "passport-photo" }),
      "Passport photo generation failed",
    );
  });

  it("passes a server fault through as itself", async () => {
    const storage = new SafeError("Storage unavailable.", {
      statusCode: 503,
      code: "STORAGE_UNAVAILABLE",
    });
    const input = await ctx({});
    const spy = vi.spyOn(sharp.prototype, "png").mockImplementationOnce(() => {
      throw storage;
    });
    try {
      await expect(processPassportGenerate(input)).rejects.toBe(storage);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps ToolInputError's class out of the answer but its code in it", async () => {
    const input = await ctx({});
    const spy = vi.spyOn(sharp.prototype, "png").mockImplementationOnce(() => {
      throw new ToolInputError("Bad crop", { code: "BAD_CROP" });
    });
    try {
      await expect(processPassportGenerate(input)).rejects.toMatchObject({
        statusCode: 422,
        details: "Bad crop",
        code: "BAD_CROP",
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("passport-photo job dispatch", () => {
  it("runs a route job from the direct-only fn while pipelines keep the full fn", async () => {
    app = await buildApp();
    expect(getDirectJobProcessFn("passport-photo")).toBe(processPassportGenerate);
    // The pipeline/batch config stays registered for the analyze-and-crop path.
    expect(getToolConfig("passport-photo")?.processV2).toBeDefined();
    expect(getToolConfig("passport-photo")?.processV2).not.toBe(processPassportGenerate);
    expect(selectJobDispatch("passport-photo", "tool")).toBe("registry");
    expect(selectJobDispatch("passport-photo", "pipeline-step")).toBe("registry");
  });
});
