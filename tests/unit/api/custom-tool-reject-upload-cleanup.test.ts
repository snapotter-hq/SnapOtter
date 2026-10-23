/**
 * Hand-written tool routes that stream uploads via receiveUpload must delete
 * uploads/<jobId>/ whenever a request is rejected before enqueueToolJob writes
 * the durable jobs row (#2599).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";

const jobRows = vi.hoisted(() => ({
  rows: [] as unknown[],
  error: null as Error | null,
}));

const mocks = vi.hoisted(() => ({
  cancelSingleJobGuarded: vi.fn(),
  deleteObject: vi.fn(),
  deletePrefix: vi.fn(),
  enqueueToolJob: vi.fn(),
  getObjectBuffer: vi.fn(),
  insertToolJobAlias: vi.fn(),
  isFeatureInstalled: vi.fn(),
  isStorageServiceFault: vi.fn(() => false),
  isToolInstalled: vi.fn(),
  putObject: vi.fn(),
  receiveUpload: vi.fn(),
  reportError: vi.fn(),
  waitForJob: vi.fn(),
}));

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () =>
          jobRows.error ? Promise.reject(jobRows.error) : Promise.resolve(jobRows.rows),
      }),
    })),
  },
  schema: { jobs: { id: {}, status: {}, error: {} } },
}));

vi.mock("../../../apps/api/src/jobs/enqueue.js", () => ({
  enqueueToolJob: mocks.enqueueToolJob,
  insertToolJobAlias: mocks.insertToolJobAlias,
  waitForJob: mocks.waitForJob,
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  cancelSingleJobGuarded: mocks.cancelSingleJobGuarded,
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  getFirstMissingBundleForTool: vi.fn(() => "face-restoration"),
  isFeatureInstalled: mocks.isFeatureInstalled,
  isToolInstalled: mocks.isToolInstalled,
}));

vi.mock("../../../apps/api/src/lib/upload-stream.js", () => ({
  receiveUpload: mocks.receiveUpload,
}));

vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>()),
  deleteObject: mocks.deleteObject,
  deletePrefix: mocks.deletePrefix,
  getObjectBuffer: mocks.getObjectBuffer,
  isStorageServiceFault: mocks.isStorageServiceFault,
  putObject: mocks.putObject,
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
  requireToolAccess: vi.fn(() =>
    Promise.resolve({ id: "user-1", username: "test", role: "admin" }),
  ),
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>()),
  reportError: mocks.reportError,
}));

import { classifyError } from "../../../apps/api/src/lib/error-report.js";
import { settleUnenqueuedAlias } from "../../../apps/api/src/lib/upload-cleanup.js";
import { registerAiCanvasExpand } from "../../../apps/api/src/routes/tools/ai-canvas-expand.js";
import { registerAutoSubtitles } from "../../../apps/api/src/routes/tools/auto-subtitles.js";
import { registerBackgroundReplace } from "../../../apps/api/src/routes/tools/background-replace.js";
import { registerBlurBackground } from "../../../apps/api/src/routes/tools/blur-background.js";
import { registerBlurFaces } from "../../../apps/api/src/routes/tools/blur-faces.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerEnhanceFaces } from "../../../apps/api/src/routes/tools/enhance-faces.js";
import { registerEraseObject } from "../../../apps/api/src/routes/tools/erase-object.js";
import { registerNoiseRemoval } from "../../../apps/api/src/routes/tools/noise-removal.js";
import { registerRedEyeRemoval } from "../../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";
import { registerRemoveGifBackground } from "../../../apps/api/src/routes/tools/remove-gif-background.js";
import { registerRestorePhoto } from "../../../apps/api/src/routes/tools/restore-photo.js";
import { registerSignPdf } from "../../../apps/api/src/routes/tools/sign-pdf.js";
import { registerTranscribeAudio } from "../../../apps/api/src/routes/tools/transcribe-audio.js";
import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";
import { registerUpscale } from "../../../apps/api/src/routes/tools/upscale.js";

const PNG = readFixture(fixtures.image.base.png200);
const GIF = readFixture(fixtures.image.animated.gif);
const PDF = readFixture(fixtures.document.pdf2);

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
const handlers: Record<string, RouteHandler> = {};

const fakeApp = {
  post: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
    const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
    handlers[path] = handler;
  }),
} as unknown as Parameters<typeof registerEraseObject>[0];

beforeAll(() => {
  registerEraseObject(fakeApp);
  registerSignPdf(fakeApp);
  registerUpscale(fakeApp);
  registerRemoveBackground(fakeApp);
  registerBlurFaces(fakeApp);
  registerColorize(fakeApp);
  registerEnhanceFaces(fakeApp);
  registerRestorePhoto(fakeApp);
  registerNoiseRemoval(fakeApp);
  registerTranscribeAudio(fakeApp);
  registerAutoSubtitles(fakeApp);
  registerAiCanvasExpand(fakeApp);
  registerBlurBackground(fakeApp);
  registerRedEyeRemoval(fakeApp);
  registerRemoveGifBackground(fakeApp);
  registerTransparencyFixer(fakeApp);
  registerBackgroundReplace(fakeApp);
});

beforeEach(() => {
  vi.clearAllMocks();
  jobRows.rows = [];
  jobRows.error = null;
  mocks.isToolInstalled.mockReturnValue(true);
  mocks.isFeatureInstalled.mockReturnValue(true);
  mocks.isStorageServiceFault.mockReturnValue(false);
  mocks.cancelSingleJobGuarded.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deletePrefix.mockResolvedValue(undefined);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.insertToolJobAlias.mockResolvedValue(true);
  mocks.enqueueToolJob.mockResolvedValue({});
  mocks.waitForJob.mockResolvedValue(null);
  mocks.getObjectBuffer.mockResolvedValue(PNG);
  mocks.receiveUpload.mockImplementation(
    (
      _part: { filename?: string },
      jobId: string,
      opts?: { uniqueName?: (n: string) => string },
    ) => {
      const raw = _part.filename ?? "photo.png";
      const filename = opts?.uniqueName ? opts.uniqueName(raw) : raw;
      return Promise.resolve({ key: `uploads/${jobId}/${filename}`, filename, size: 100 });
    },
  );
});

const ROUTES = [
  ["erase-object", "/api/v1/tools/image/erase-object"],
  ["sign-pdf", "/api/v1/tools/pdf/sign-pdf"],
  ["upscale", "/api/v1/tools/image/upscale"],
  ["remove-background", "/api/v1/tools/image/remove-background"],
  ["blur-faces", "/api/v1/tools/image/blur-faces"],
  ["colorize", "/api/v1/tools/image/colorize"],
  ["enhance-faces", "/api/v1/tools/image/enhance-faces"],
  ["restore-photo", "/api/v1/tools/image/restore-photo"],
  ["noise-removal", "/api/v1/tools/image/noise-removal"],
  ["transcribe-audio", "/api/v1/tools/audio/transcribe-audio"],
  ["auto-subtitles", "/api/v1/tools/video/auto-subtitles"],
  ["ai-canvas-expand", "/api/v1/tools/image/ai-canvas-expand"],
  ["blur-background", "/api/v1/tools/image/blur-background"],
  ["red-eye-removal", "/api/v1/tools/image/red-eye-removal"],
  ["remove-gif-background", "/api/v1/tools/image/remove-gif-background"],
  ["transparency-fixer", "/api/v1/tools/image/transparency-fixer"],
  ["background-replace", "/api/v1/tools/image/background-replace"],
] as const;

function makeReply() {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    raw: { destroyed: false, writableEnded: false, once: vi.fn(), removeListener: vi.fn() },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

function makeRequest(partsList: Array<Record<string, unknown>>) {
  return {
    headers: {},
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    raw: { socket: { destroyed: false }, once: vi.fn(), removeListener: vi.fn() },
    parts: async function* () {
      for (const p of partsList) {
        yield p;
      }
    },
  };
}

function validPartsFor(toolId: string): Array<Record<string, unknown>> {
  if (toolId === "erase-object") {
    return [
      { type: "file", fieldname: "file", filename: "photo.png", file: {} },
      { type: "file", fieldname: "mask", filename: "mask.png", file: {} },
    ];
  }
  if (toolId === "sign-pdf") {
    return [
      { type: "file", fieldname: "file", filename: "doc.pdf", file: {} },
      { type: "file", fieldname: "sig0", filename: "sig0.png", file: {} },
      {
        type: "field",
        fieldname: "placements",
        value: JSON.stringify([{ sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 }]),
      },
    ];
  }
  if (toolId === "ai-canvas-expand") {
    return [
      { type: "file", fieldname: "file", filename: "photo.png", file: {} },
      { type: "field", fieldname: "settings", value: JSON.stringify({ extendTop: 10 }) },
    ];
  }
  if (toolId === "remove-gif-background") {
    return [{ type: "file", fieldname: "file", filename: "anim.gif", file: {} }];
  }
  return [{ type: "file", fieldname: "file", filename: "photo.png", file: {} }];
}

function twoFilePartsFor(toolId: string): Array<Record<string, unknown>> {
  const parts = [...validPartsFor(toolId)];
  const fileCount = parts.filter((p) => p.type === "file").length;
  if (fileCount < 2) {
    parts.push({ type: "file", fieldname: "file", filename: "second.png", file: {} });
  }
  return parts;
}

function setupValidBuffersFor(toolId: string) {
  if (toolId === "sign-pdf") {
    mocks.getObjectBuffer.mockImplementation((key: string) =>
      Promise.resolve(key.endsWith(".pdf") ? PDF : PNG),
    );
  } else if (toolId === "remove-gif-background") {
    mocks.getObjectBuffer.mockResolvedValue(GIF);
  } else {
    mocks.getObjectBuffer.mockResolvedValue(PNG);
  }
}

describe("custom tool routes discard uploads when rejecting before enqueue (#2599)", () => {
  it.each(ROUTES)("%s deletes uploads/<jobId>/ when saveMode is invalid", async (toolId, path) => {
    setupValidBuffersFor(toolId);
    const req = makeRequest([
      ...validPartsFor(toolId),
      {
        type: "field",
        fieldname: "clientJobId",
        value: "11111111-1111-4111-8111-111111111111",
      },
      { type: "field", fieldname: "saveMode", value: "invalid" },
    ]);
    const reply = makeReply();

    await handlers[path](req, reply);

    expect(reply.statusCode).toBe(400);
    expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
    const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
    expect(uploadedJobId).not.toBe("11111111-1111-4111-8111-111111111111");
    expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: "11111111-1111-4111-8111-111111111111",
      expectedArtifactJobId: uploadedJobId,
    });
  });

  it.each(ROUTES)(
    "%s deletes uploads/<jobId>/ when clientJobId is invalid",
    async (toolId, path) => {
      setupValidBuffersFor(toolId);
      const req = makeRequest([
        ...validPartsFor(toolId),
        { type: "field", fieldname: "clientJobId", value: "not a valid id" },
      ]);
      const reply = makeReply();

      await handlers[path](req, reply);

      expect(reply.statusCode).toBe(400);
      expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
      const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
      expect(mocks.cancelSingleJobGuarded).not.toHaveBeenCalled();
    },
  );

  it.each(ROUTES)(
    "%s deletes uploads/<jobId>/ when enqueueToolJob rejects before inserting the jobs row (e.g. 429 quota)",
    async (toolId, path) => {
      setupValidBuffersFor(toolId);
      jobRows.rows = [];
      const quotaErr = Object.assign(new Error("Too many concurrent AI jobs"), { statusCode: 429 });
      mocks.enqueueToolJob.mockRejectedValueOnce(quotaErr);
      const req = makeRequest([
        ...validPartsFor(toolId),
        {
          type: "field",
          fieldname: "clientJobId",
          value: "11111111-1111-4111-8111-111111111111",
        },
      ]);
      const reply = makeReply();

      await expect(handlers[path](req, reply)).rejects.toThrow("Too many concurrent AI jobs");

      const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
      expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
        jobId: "11111111-1111-4111-8111-111111111111",
        expectedArtifactJobId: uploadedJobId,
      });
    },
  );

  it.each(ROUTES)(
    "%s keeps uploads/<jobId>/ when enqueueToolJob fails after the jobs row was written",
    async (toolId, path) => {
      setupValidBuffersFor(toolId);
      jobRows.rows = [{ id: "existing-job-row" }];
      mocks.enqueueToolJob.mockRejectedValueOnce(new Error("redis queue.add failed"));
      const req = makeRequest([
        ...validPartsFor(toolId),
        {
          type: "field",
          fieldname: "clientJobId",
          value: "11111111-1111-4111-8111-111111111111",
        },
      ]);
      const reply = makeReply();

      await expect(handlers[path](req, reply)).rejects.toThrow("redis queue.add failed");

      expect(mocks.deletePrefix).not.toHaveBeenCalled();
      expect(mocks.cancelSingleJobGuarded).not.toHaveBeenCalled();
    },
  );

  it.each(ROUTES)(
    "%s keeps uploads/<jobId>/ when the request is enqueued",
    async (toolId, path) => {
      setupValidBuffersFor(toolId);
      const req = makeRequest([
        ...validPartsFor(toolId),
        {
          type: "field",
          fieldname: "clientJobId",
          value: "11111111-1111-4111-8111-111111111111",
        },
      ]);
      const reply = makeReply();

      await handlers[path](req, reply);

      expect(reply.statusCode).toBe(202);
      expect(mocks.enqueueToolJob).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).not.toHaveBeenCalled();
      expect(mocks.cancelSingleJobGuarded).not.toHaveBeenCalled();
    },
  );

  it.each(ROUTES)(
    "%s skips cancelSingleJobGuarded when insertToolJobAlias returned false on a reused clientJobId (#2617)",
    async (toolId, path) => {
      setupValidBuffersFor(toolId);
      mocks.insertToolJobAlias.mockResolvedValueOnce(false);
      const req = makeRequest([
        ...validPartsFor(toolId),
        {
          type: "field",
          fieldname: "clientJobId",
          value: "11111111-1111-4111-8111-111111111111",
        },
        { type: "field", fieldname: "saveMode", value: "invalid" },
      ]);
      const reply = makeReply();

      await handlers[path](req, reply);

      expect(reply.statusCode).toBe(400);
      expect(mocks.cancelSingleJobGuarded).not.toHaveBeenCalled();
    },
  );

  it("logs a warning and does not throw when cancelSingleJobGuarded fails during rejection cleanup (#2617)", async () => {
    mocks.cancelSingleJobGuarded.mockRejectedValueOnce(new Error("db update failed"));
    const clientJobId = "11111111-1111-4111-8111-111111111111";
    const req = makeRequest([
      ...validPartsFor("upscale"),
      { type: "field", fieldname: "clientJobId", value: clientJobId },
      { type: "field", fieldname: "saveMode", value: "invalid" },
    ]);
    const reply = makeReply();

    await handlers["/api/v1/tools/image/upscale"](req, reply);

    expect(reply.statusCode).toBe(400);
    expect(req.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: expect.any(String),
        clientJobId,
      }),
      "failed to settle a rejected request's job alias",
    );
  });

  it("settleUnenqueuedAlias skips empty or self-pointing clientJobIds and swallows errors when log is omitted (#2617)", async () => {
    await settleUnenqueuedAlias("job-1", null);
    await settleUnenqueuedAlias("job-1", undefined);
    await settleUnenqueuedAlias("job-1", "");
    await settleUnenqueuedAlias("job-1", "job-1");
    expect(mocks.cancelSingleJobGuarded).not.toHaveBeenCalled();

    mocks.cancelSingleJobGuarded.mockRejectedValueOnce(new Error("db update failed"));
    await expect(settleUnenqueuedAlias("job-1", "client-1")).resolves.toBeUndefined();
    expect(mocks.cancelSingleJobGuarded).toHaveBeenCalledWith({
      jobId: "client-1",
      expectedArtifactJobId: "job-1",
    });
  });

  it("erase-object deletes uploads/<jobId>/ on missing mask, invalid settings, and missing inpaint-hq 501", async () => {
    const missingMaskReply = makeReply();
    await handlers["/api/v1/tools/image/erase-object"](
      makeRequest([{ type: "file", fieldname: "file", filename: "photo.png", file: {} }]),
      missingMaskReply,
    );
    expect(missingMaskReply.statusCode).toBe(400);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const badFormatReply = makeReply();
    await handlers["/api/v1/tools/image/erase-object"](
      makeRequest([
        ...validPartsFor("erase-object"),
        { type: "field", fieldname: "format", value: "bmp" },
      ]),
      badFormatReply,
    );
    expect(badFormatReply.statusCode).toBe(400);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.isFeatureInstalled.mockReturnValue(false);
    const missingHqReply = makeReply();
    await handlers["/api/v1/tools/image/erase-object"](
      makeRequest([
        ...validPartsFor("erase-object"),
        { type: "field", fieldname: "qualityMode", value: "hq" },
      ]),
      missingHqReply,
    );
    expect(missingHqReply.statusCode).toBe(501);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
  });

  it("logs a warning and does not throw when deletePrefix fails during rejection cleanup", async () => {
    mocks.deletePrefix.mockRejectedValueOnce(new Error("s3 delete failed"));
    const req = makeRequest([
      ...validPartsFor("upscale"),
      { type: "field", fieldname: "saveMode", value: "invalid" },
    ]);
    const reply = makeReply();

    await handlers["/api/v1/tools/image/upscale"](req, reply);

    expect(reply.statusCode).toBe(400);
    expect(req.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: expect.any(String),
      }),
      "failed to discard a rejected request's uploads",
    );
  });

  it("keeps uploads/<jobId>/ and logs a warning when the jobs row check itself fails after enqueueToolJob throws", async () => {
    setupValidBuffersFor("upscale");
    jobRows.error = new Error("db connection lost");
    mocks.enqueueToolJob.mockRejectedValueOnce(new Error("queue add failed"));
    const req = makeRequest(validPartsFor("upscale"));
    const reply = makeReply();

    await expect(handlers["/api/v1/tools/image/upscale"](req, reply)).rejects.toThrow(
      "queue add failed",
    );

    expect(mocks.deletePrefix).not.toHaveBeenCalled();
    expect(req.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        jobId: expect.any(String),
      }),
      "failed to check whether rejected request persisted a jobs row; keeping uploads",
    );
  });

  it("deletes uploads/<jobId>/ on post-getObjectBuffer rejections (corrupt image, invalid settings JSON, static image on remove-gif-background, zero directions on ai-canvas-expand)", async () => {
    mocks.getObjectBuffer.mockResolvedValueOnce(Buffer.from("not an image"));
    const corruptReply = makeReply();
    await handlers["/api/v1/tools/image/upscale"](
      makeRequest(validPartsFor("upscale")),
      corruptReply,
    );
    expect(corruptReply.statusCode).toBe(400);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.getObjectBuffer.mockResolvedValueOnce(PNG);
    const badJsonReply = makeReply();
    await handlers["/api/v1/tools/image/colorize"](
      makeRequest([
        ...validPartsFor("colorize"),
        { type: "field", fieldname: "settings", value: "{bad json" },
      ]),
      badJsonReply,
    );
    expect(badJsonReply.statusCode).toBe(400);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.getObjectBuffer.mockResolvedValueOnce(PNG);
    const notAnimatedReply = makeReply();
    await handlers["/api/v1/tools/image/remove-gif-background"](
      makeRequest(validPartsFor("remove-gif-background")),
      notAnimatedReply,
    );
    expect(notAnimatedReply.statusCode).toBe(400);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mocks.getObjectBuffer.mockResolvedValueOnce(PNG);
    const zeroDirReply = makeReply();
    await handlers["/api/v1/tools/image/ai-canvas-expand"](
      makeRequest([
        { type: "file", fieldname: "file", filename: "photo.png", file: {} },
        { type: "field", fieldname: "settings", value: JSON.stringify({}) },
      ]),
      zeroDirReply,
    );
    expect(zeroDirReply.statusCode).toBe(400);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
  });

  it.each(ROUTES)(
    "%s deletes earlier uploaded parts before answering when the second file part fails with 413 (#1644, #2783)",
    async (toolId, path) => {
      const tooLarge = Object.assign(new Error("Object exceeds the maximum allowed size"), {
        statusCode: 413,
        limitBytes: 1024 * 1024,
      });
      mocks.receiveUpload
        .mockImplementationOnce((_part: { filename?: string }, jobId: string) =>
          Promise.resolve({
            key: `uploads/${jobId}/${_part.filename ?? "first"}`,
            filename: _part.filename ?? "first",
            size: 100,
          }),
        )
        .mockRejectedValueOnce(tooLarge);

      const req = makeRequest(twoFilePartsFor(toolId));
      const reply = makeReply();
      const sendSpy = vi.spyOn(reply, "send");

      await handlers[path](req, reply);

      const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(reply.statusCode).toBe(413);
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
      expect(mocks.deletePrefix.mock.invocationCallOrder[0]).toBeLessThan(
        sendSpy.mock.invocationCallOrder[0],
      );
    },
  );

  it.each(ROUTES)(
    "%s deletes earlier uploaded parts before rethrowing when the second file part fails with 503 (#1644, #2783)",
    async (toolId, path) => {
      const capFault = Object.assign(new Error("The server's workspace is full."), {
        statusCode: 503,
        code: "workspace-cap",
      });
      mocks.receiveUpload
        .mockImplementationOnce((_part: { filename?: string }, jobId: string) =>
          Promise.resolve({
            key: `uploads/${jobId}/${_part.filename ?? "first"}`,
            filename: _part.filename ?? "first",
            size: 100,
          }),
        )
        .mockRejectedValueOnce(capFault);

      const req = makeRequest(twoFilePartsFor(toolId));
      const reply = makeReply();

      await expect(handlers[path](req, reply)).rejects.toBe(capFault);

      const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
    },
  );

  it.each(ROUTES)(
    "%s deletes earlier uploaded parts and logs a warning without masking a mid-loop 400 or 503 when deletePrefix fails (#1644, #2783)",
    async (toolId, path) => {
      const parseErr = new Error("Unexpected end of form");
      mocks.receiveUpload
        .mockImplementationOnce((_part: { filename?: string }, jobId: string) =>
          Promise.resolve({
            key: `uploads/${jobId}/${_part.filename ?? "first"}`,
            filename: _part.filename ?? "first",
            size: 100,
          }),
        )
        .mockRejectedValueOnce(parseErr);
      mocks.deletePrefix.mockRejectedValueOnce(new Error("S3 cleanup fault"));

      const req = makeRequest(twoFilePartsFor(toolId));
      const reply = makeReply();

      await handlers[path](req, reply);

      expect(reply.statusCode).toBe(400);
      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(req.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), jobId: expect.any(String) }),
        "failed to discard a rejected request's uploads",
      );

      vi.clearAllMocks();
      const capFault = Object.assign(new Error("The server's workspace is full."), {
        statusCode: 503,
        code: "workspace-cap",
      });
      mocks.receiveUpload
        .mockImplementationOnce((_part: { filename?: string }, jobId: string) =>
          Promise.resolve({
            key: `uploads/${jobId}/${_part.filename ?? "first"}`,
            filename: _part.filename ?? "first",
            size: 100,
          }),
        )
        .mockRejectedValueOnce(capFault);
      mocks.deletePrefix.mockRejectedValueOnce(new Error("S3 cleanup fault"));

      const req503 = makeRequest(twoFilePartsFor(toolId));
      const reply503 = makeReply();

      await expect(handlers[path](req503, reply503)).rejects.toBe(capFault);

      expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      expect(req503.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), jobId: expect.any(String) }),
        "failed to discard a rejected request's uploads",
      );
    },
  );

  it("remove-gif-background deletes the uploaded GIF when the backgroundImage stream fails with 413 (#2783)", async () => {
    const tooLarge = Object.assign(new Error("request file too large"), {
      statusCode: 413,
      code: "FST_REQ_FILE_TOO_LARGE",
      limitBytes: 1024 * 1024,
    });
    const req = makeRequest([
      { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
      {
        type: "file",
        fieldname: "backgroundImage",
        filename: "bg.png",
        file: {
          async *[Symbol.asyncIterator]() {
            yield Buffer.from("partial");
            throw tooLarge;
          },
        },
      },
    ]);
    const reply = makeReply();
    const sendSpy = vi.spyOn(reply, "send");

    await handlers["/api/v1/tools/image/remove-gif-background"](req, reply);

    const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
    expect(reply.statusCode).toBe(413);
    expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
    expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
    expect(mocks.deletePrefix.mock.invocationCallOrder[0]).toBeLessThan(
      sendSpy.mock.invocationCallOrder[0],
    );
  });
});

const PRE_ENQUEUE_READ_ROUTES = ROUTES.filter(
  ([toolId]) => toolId !== "transcribe-audio" && toolId !== "auto-subtitles",
);

describe("pre-enqueue S3 getObjectBuffer fault normalization and sign-pdf waitForJob settlement (#3481)", () => {
  it.each(PRE_ENQUEUE_READ_ROUTES)(
    "%s normalizes pre-enqueue S3 getObjectBuffer faults into a 503 storage-unavailable SafeError and discards uploads",
    async (toolId, path) => {
      mocks.isStorageServiceFault.mockReturnValue(true);
      const slowDown = Object.assign(new Error("Please reduce your request rate."), {
        name: "SlowDown",
        $metadata: { httpStatusCode: 503 },
      });
      mocks.getObjectBuffer.mockRejectedValueOnce(slowDown);

      const req = makeRequest(validPartsFor(toolId));
      const reply = makeReply();
      let caught: unknown;
      try {
        await handlers[path](req, reply);
      } catch (err) {
        caught = err;
      }

      expect(caught).toMatchObject({
        name: "SafeError",
        statusCode: 503,
        code: "storage-unavailable",
        message: "The server's storage service is unavailable.",
      });
      expect(classifyError(caught, "http")).toBe("operational");
      expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
      const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);

      // Unexpected non-S3 defect passes through untouched and classifies as bug
      mocks.deletePrefix.mockClear();
      mocks.receiveUpload.mockClear();
      const defect = new TypeError("unexpected S3 client defect");
      mocks.getObjectBuffer.mockRejectedValueOnce(defect);
      const bugReq = makeRequest(validPartsFor(toolId));
      let caughtDefect: unknown;
      try {
        await handlers[path](bugReq, makeReply());
      } catch (err) {
        caughtDefect = err;
      }
      expect(caughtDefect).toBe(defect);
      expect(classifyError(caughtDefect, "http")).toBe("bug");
      const bugJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${bugJobId}/`);

      // When isStorageServiceFault returns false, an EIO error passes through untouched
      mocks.isStorageServiceFault.mockReturnValue(false);
      mocks.deletePrefix.mockClear();
      mocks.receiveUpload.mockClear();
      const localEio = Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
      mocks.getObjectBuffer.mockRejectedValueOnce(localEio);
      const localReq = makeRequest(validPartsFor(toolId));
      let caughtLocal: unknown;
      try {
        await handlers[path](localReq, makeReply());
      } catch (err) {
        caughtLocal = err;
      }
      expect(caughtLocal).toBe(localEio);
      const localJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${localJobId}/`);
    },
  );

  it.each([
    ["erase-object", "/api/v1/tools/image/erase-object", PNG],
    ["sign-pdf", "/api/v1/tools/pdf/sign-pdf", PDF],
  ] as const)(
    "%s normalizes S3 getObjectBuffer faults on the secondary file part (mask/sig0) into a 503 storage-unavailable SafeError",
    async (toolId, path, firstBuffer) => {
      mocks.isStorageServiceFault.mockReturnValue(true);
      const eioFault = Object.assign(new Error("EIO: i/o error, read"), { code: "EIO" });
      mocks.getObjectBuffer.mockResolvedValueOnce(firstBuffer).mockRejectedValueOnce(eioFault);

      const req = makeRequest(validPartsFor(toolId));
      const reply = makeReply();
      let caught: unknown;
      try {
        await handlers[path](req, reply);
      } catch (err) {
        caught = err;
      }

      expect(caught).toMatchObject({
        name: "SafeError",
        statusCode: 503,
        code: "storage-unavailable",
        message: "The server's storage service is unavailable.",
      });
      expect(classifyError(caught, "http")).toBe("operational");
      expect(mocks.enqueueToolJob).not.toHaveBeenCalled();
      const uploadedJobId = mocks.receiveUpload.mock.calls[0][1] as string;
      expect(mocks.deletePrefix).toHaveBeenCalledWith(`uploads/${uploadedJobId}/`);
    },
  );

  it("sign-pdf propagates settled httpStatus, code, details, and canceled state from schema.jobs when waitForJob rejects", async () => {
    setupValidBuffersFor("sign-pdf");

    // 1. Worker 503 storage-unavailable fault
    jobRows.rows = [
      {
        error: {
          message: "The server's storage service is unavailable.",
          code: "storage-unavailable",
          httpStatus: 503,
        },
      },
    ];
    mocks.waitForJob.mockRejectedValueOnce(
      new Error("The server's storage service is unavailable."),
    );
    const req503 = makeRequest(validPartsFor("sign-pdf"));
    const reply503 = makeReply();
    await handlers["/api/v1/tools/pdf/sign-pdf"](req503, reply503);
    expect(reply503.statusCode).toBe(503);
    expect(reply503.payload).toEqual({
      error: "The server's storage service is unavailable.",
      code: "storage-unavailable",
    });
    expect(req503.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: "sign-pdf" }),
      "sign-pdf processing failed",
    );

    // 2. Worker 400 input rejection with details and code
    jobRows.rows = [
      {
        error: {
          message: "Placement page out of range",
          details: "PDF has 2 pages",
          code: "INVALID_PAGE",
          httpStatus: 400,
        },
      },
    ];
    mocks.waitForJob.mockRejectedValueOnce(new Error("Placement page out of range"));
    const req400 = makeRequest(validPartsFor("sign-pdf"));
    const reply400 = makeReply();
    await handlers["/api/v1/tools/pdf/sign-pdf"](req400, reply400);
    expect(reply400.statusCode).toBe(400);
    expect(reply400.payload).toEqual({
      error: "Placement page out of range",
      details: "PDF has 2 pages",
      code: "INVALID_PAGE",
    });
    expect(req400.log.info).toHaveBeenCalledWith(
      expect.objectContaining({ toolId: "sign-pdf" }),
      "sign-pdf rejected input",
    );

    // 3. Canceled job inside sync window
    jobRows.rows = [{ status: "canceled" }];
    mocks.waitForJob.mockRejectedValueOnce(new Error("Canceled"));
    const reqCancel = makeRequest(validPartsFor("sign-pdf"));
    const replyCancel = makeReply();
    await handlers["/api/v1/tools/pdf/sign-pdf"](reqCancel, replyCancel);
    expect(replyCancel.statusCode).toBe(422);
    expect(replyCancel.payload).toEqual({
      error: "Canceled",
      canceled: true,
    });

    // 4. Forged "Canceled" message when job row status is not "canceled" falls through to 422
    jobRows.rows = [{ status: "failed", error: { message: "Canceled" } }];
    mocks.waitForJob.mockRejectedValueOnce(new Error("Canceled"));
    const reqForged = makeRequest(validPartsFor("sign-pdf"));
    const replyForged = makeReply();
    await handlers["/api/v1/tools/pdf/sign-pdf"](reqForged, replyForged);
    expect(replyForged.statusCode).toBe(422);
    expect(replyForged.payload).toEqual({
      error: "Processing failed",
      details: "Canceled",
    });

    // 5. DB read failure when checking canceled and failed job row reports readErr and rethrows (#3698)
    jobRows.error = new Error("db read timeout");
    const cancelErr = new Error("Canceled");
    mocks.waitForJob.mockRejectedValueOnce(cancelErr);
    const reqDbErr = Object.assign(makeRequest(validPartsFor("sign-pdf")), {
      method: "POST",
      routeOptions: { url: "/api/v1/tools/pdf/sign-pdf" },
    });
    const replyDbErr = makeReply();
    await expect(handlers["/api/v1/tools/pdf/sign-pdf"](reqDbErr, replyDbErr)).rejects.toBe(
      cancelErr,
    );
    expect(replyDbErr.payload).toBeUndefined();
    expect(reqDbErr.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: jobRows.error }),
      "canceled job status read failed",
    );
    expect(reqDbErr.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: jobRows.error }),
      "failed job row read failed",
    );
    expect(mocks.reportError).toHaveBeenCalledWith(jobRows.error, {
      source: "http",
      route: "/api/v1/tools/pdf/sign-pdf",
      method: "POST",
      jobId: expect.any(String),
    });

    // 6. Sanitizes Python traceback via friendlyError and prefers failure.message when present (#3667)
    jobRows.error = null;
    const rawTraceback = new Error(
      'Traceback (most recent call last):\n  File "/opt/app/doc_sign.py", line 42\nRuntimeError: fitz internal error',
    );
    jobRows.rows = [
      {
        error: {
          message: "Processing failed. Check that the input file is valid and not corrupted.",
        },
      },
    ];
    mocks.waitForJob.mockRejectedValueOnce(rawTraceback);
    const reqRowMsg = makeRequest(validPartsFor("sign-pdf"));
    const replyRowMsg = makeReply();
    await handlers["/api/v1/tools/pdf/sign-pdf"](reqRowMsg, replyRowMsg);
    expect(replyRowMsg.statusCode).toBe(422);
    expect(replyRowMsg.payload).toEqual({
      error: "Processing failed",
      details: "Processing failed. Check that the input file is valid and not corrupted.",
    });

    // Empty failure.message falls back to err.message (or String(err)) and runs friendlyError
    jobRows.rows = [{ error: { message: "" } }];
    mocks.waitForJob.mockRejectedValueOnce(rawTraceback);
    const reqEmptyMsg = makeRequest(validPartsFor("sign-pdf"));
    const replyEmptyMsg = makeReply();
    await handlers["/api/v1/tools/pdf/sign-pdf"](reqEmptyMsg, replyEmptyMsg);
    expect(replyEmptyMsg.statusCode).toBe(422);
    expect(replyEmptyMsg.payload).toEqual({
      error: "Processing failed",
      details: "Processing failed. The file may be in an unsupported or corrupted format.",
    });

    jobRows.rows = [{ error: { message: "" } }];
    mocks.waitForJob.mockRejectedValueOnce("non-error string failure");
    const reqStringErr = makeRequest(validPartsFor("sign-pdf"));
    const replyStringErr = makeReply();
    await handlers["/api/v1/tools/pdf/sign-pdf"](reqStringErr, replyStringErr);
    expect(replyStringErr.statusCode).toBe(422);
    expect(replyStringErr.payload).toEqual({
      error: "Processing failed",
      details: "non-error string failure",
    });

    // 7. Rethrows Redis, stall, and unsettled-row faults when failure === null (#3667, #3698)
    for (const operationalFault of [
      Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), { code: "ECONNREFUSED" }),
      Object.assign(new Error("connect ETIMEDOUT 127.0.0.1:6379"), { code: "ETIMEDOUT" }),
      Object.assign(new Error("Reached the max retries per request limit"), {
        name: "MaxRetriesPerRequestError",
      }),
      Object.assign(new Error("OOM command not allowed when used memory > 'maxmemory'."), {
        name: "ReplyError",
      }),
      new Error("Missing lock for job 1 moveToFinished"),
      new Error("job stalled more than allowable limit"),
    ]) {
      mocks.deletePrefix.mockClear();
      jobRows.rows = [{ error: null }];
      mocks.waitForJob.mockRejectedValueOnce(operationalFault);
      const reqRedis = makeRequest(validPartsFor("sign-pdf"));
      const replyRedis = makeReply();
      await expect(handlers["/api/v1/tools/pdf/sign-pdf"](reqRedis, replyRedis)).rejects.toBe(
        operationalFault,
      );
      expect(classifyError(operationalFault, "http")).toBe("operational");
      expect(replyRedis.payload).toBeUndefined();
      expect(reqRedis.log.error).not.toHaveBeenCalled();
      expect(mocks.deletePrefix).not.toHaveBeenCalled();
    }

    // Worker 503 fault whose terminal DB write failed leaves schema.jobs.error null (#3698)
    const unsettled503 = new Error("The server's storage service is unavailable.");
    jobRows.rows = [{ status: "processing", error: null }];
    mocks.waitForJob.mockRejectedValueOnce(unsettled503);
    const reqUnsettled = makeRequest(validPartsFor("sign-pdf"));
    const replyUnsettled = makeReply();
    await expect(handlers["/api/v1/tools/pdf/sign-pdf"](reqUnsettled, replyUnsettled)).rejects.toBe(
      unsettled503,
    );
    expect(replyUnsettled.payload).toBeUndefined();
    expect(reqUnsettled.log.error).not.toHaveBeenCalled();

    // Also rethrows fault and reports readErr when reading schema.jobs.error itself rejects
    mocks.reportError.mockClear();
    jobRows.error = new Error("db error read timeout");
    const redisAndDbFault = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:6379"), {
      code: "ECONNREFUSED",
    });
    mocks.waitForJob.mockRejectedValueOnce(redisAndDbFault);
    const reqRedisDb = makeRequest(validPartsFor("sign-pdf"));
    const replyRedisDb = makeReply();
    await expect(handlers["/api/v1/tools/pdf/sign-pdf"](reqRedisDb, replyRedisDb)).rejects.toBe(
      redisAndDbFault,
    );
    expect(reqRedisDb.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: jobRows.error }),
      "failed job row read failed",
    );
    expect(mocks.reportError).toHaveBeenCalledWith(
      jobRows.error,
      expect.objectContaining({ source: "http" }),
    );
    expect(reqRedisDb.log.error).not.toHaveBeenCalled();
    jobRows.error = null;
  });
});
