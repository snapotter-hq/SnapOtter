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
  isToolInstalled: vi.fn(),
  putObject: vi.fn(),
  receiveUpload: vi.fn(),
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
  schema: { jobs: { id: {} } },
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
  putObject: mocks.putObject,
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  getAuthUser: vi.fn(() => ({ id: "user-1", username: "test", role: "admin" })),
  requireToolAccess: vi.fn(() =>
    Promise.resolve({ id: "user-1", username: "test", role: "admin" }),
  ),
}));

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
