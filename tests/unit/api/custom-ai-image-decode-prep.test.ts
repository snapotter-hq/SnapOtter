/**
 * #3313: custom AI image routes and pipeline process functions must:
 * 1. Forward lowercase `fileExt` (or `undefined` when extensionless) to
 *    `decodeToSharpCompat`.
 * 2. Run `decompressSvgz` and `sanitizeSvg` on SVG/SVGZ uploads (returning 400
 *    on client SVG/SVGZ errors) and rasterize SVG inputs to PNG for Python
 *    sidecar scripts, while running `autoOrient(buf, request.log)` on non-SVGs.
 * 3. Normalize operational write errors (`ENOSPC`, `EACCES`, etc.) and rethrow
 *    `DecoderUnavailableError` / 5xx errors while suppressing `request.log.error`
 *    when a client upload fails decoding (422).
 * 4. Prepare `backgroundImage` on `POST /api/v1/tools/image/remove-gif-background`
 *    through the same decode, SVG sanitization, EXIF orientation, and PNG
 *    staging pipeline before handing it to Pillow in the sidecar.
 */

import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { isToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtures, readFixture } from "../../fixtures/index.js";

const mocks = vi.hoisted(() => ({
  analyzeImage: vi.fn(),
  blurFaces: vi.fn(),
  cancelSingleJobGuarded: vi.fn(),
  colorize: vi.fn(),
  dbInsertValues: vi.fn(),
  deleteObject: vi.fn(),
  deletePrefix: vi.fn(),
  detectAnimation: vi.fn(),
  detectFaceLandmarks: vi.fn(),
  enqueueToolJob: vi.fn(),
  getObjectBuffer: vi.fn(),
  insertToolJobAlias: vi.fn(),
  isFeatureInstalled: vi.fn(),
  isToolInstalled: vi.fn(),
  outpaint: vi.fn(),
  putObject: vi.fn(),
  receiveUpload: vi.fn(),
  removeBackground: vi.fn(),
  removeBackgroundAnimated: vi.fn(),
  removeRedEye: vi.fn(),
  reportError: vi.fn(),
  seamCarve: vi.fn(),
  updateSingleFileProgress: vi.fn(),
  waitForJob: vi.fn(),
}));

vi.mock("../../../apps/api/src/lib/error-report.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/lib/error-report.js")>()),
  reportError: mocks.reportError,
}));

vi.mock("../../../apps/api/src/lib/file-validation.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/file-validation.js")>();
  return {
    ...actual,
    validateImageBuffer: vi.fn((...args: Parameters<typeof actual.validateImageBuffer>) =>
      actual.validateImageBuffer(...args),
    ),
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({
      values: (...args: unknown[]) => mocks.dbInsertValues(...args),
    }),
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve([]),
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
  updateSingleFileProgress: mocks.updateSingleFileProgress,
}));

vi.mock("../../../apps/api/src/lib/feature-status.js", () => ({
  getFirstMissingBundleForTool: vi.fn(() => null),
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

vi.mock("@snapotter/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/ai")>()),
  blurFaces: mocks.blurFaces,
  colorize: mocks.colorize,
  detectFaceLandmarks: mocks.detectFaceLandmarks,
  outpaint: mocks.outpaint,
  removeBackground: mocks.removeBackground,
  removeBackgroundAnimated: mocks.removeBackgroundAnimated,
  removeRedEye: mocks.removeRedEye,
  seamCarve: mocks.seamCarve,
}));

import * as autoOrientModule from "../../../apps/api/src/lib/auto-orient.js";
import * as fileValidation from "../../../apps/api/src/lib/file-validation.js";
import * as formatDecoders from "../../../apps/api/src/lib/format-decoders.js";
import * as heicConverter from "../../../apps/api/src/lib/heic-converter.js";
import { prepareRouteImage } from "../../../apps/api/src/lib/image-input-prep.js";
import * as svgSanitize from "../../../apps/api/src/lib/svg-sanitize.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerAiCanvasExpand } from "../../../apps/api/src/routes/tools/ai-canvas-expand.js";
import { registerBackgroundReplace } from "../../../apps/api/src/routes/tools/background-replace.js";
import { registerBlurBackground } from "../../../apps/api/src/routes/tools/blur-background.js";
import { registerBlurFaces } from "../../../apps/api/src/routes/tools/blur-faces.js";
import { registerColorize } from "../../../apps/api/src/routes/tools/colorize.js";
import { registerContentAwareResize } from "../../../apps/api/src/routes/tools/content-aware-resize.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerEnhanceFaces } from "../../../apps/api/src/routes/tools/enhance-faces.js";
import { registerEraseObject } from "../../../apps/api/src/routes/tools/erase-object.js";
import { registerImageEnhancement } from "../../../apps/api/src/routes/tools/image-enhancement.js";
import { registerNoiseRemoval } from "../../../apps/api/src/routes/tools/noise-removal.js";
import { registerOptimizeForWeb } from "../../../apps/api/src/routes/tools/optimize-for-web.js";
import { registerPassportPhoto } from "../../../apps/api/src/routes/tools/passport-photo.js";
import { registerRedEyeRemoval } from "../../../apps/api/src/routes/tools/red-eye-removal.js";
import { registerRemoveBackground } from "../../../apps/api/src/routes/tools/remove-background.js";
import { registerRemoveGifBackground } from "../../../apps/api/src/routes/tools/remove-gif-background.js";
import { registerRestorePhoto } from "../../../apps/api/src/routes/tools/restore-photo.js";
import { registerTransparencyFixer } from "../../../apps/api/src/routes/tools/transparency-fixer.js";
import { registerUpscale } from "../../../apps/api/src/routes/tools/upscale.js";

const GIF = readFixture(fixtures.image.animated.gif);
const HEIC = readFixture(fixtures.image.base.heic200);

type RouteHandler = (request: unknown, reply: unknown) => Promise<unknown>;
const handlers: Record<string, RouteHandler> = {};

const fakeApp = {
  post: vi.fn((path: string, arg2: unknown, arg3?: unknown) => {
    const handler = (typeof arg2 === "function" ? arg2 : arg3) as RouteHandler;
    handlers[path] = handler;
  }),
} as unknown as Parameters<typeof registerEraseObject>[0];

let validPng: Buffer;
let validAvif: Buffer;

beforeAll(async () => {
  validPng = await sharp({
    create: { width: 16, height: 16, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
  validAvif = await sharp(validPng).avif().toBuffer();

  registerRemoveBackground(fakeApp);
  registerAiCanvasExpand(fakeApp);
  registerBlurFaces(fakeApp);
  registerBackgroundReplace(fakeApp);
  registerBlurBackground(fakeApp);
  registerColorize(fakeApp);
  registerContentAwareResize(fakeApp);
  registerEditMetadata(fakeApp);
  registerEraseObject(fakeApp);
  registerEnhanceFaces(fakeApp);
  registerImageEnhancement(fakeApp);
  registerNoiseRemoval(fakeApp);
  registerOptimizeForWeb(fakeApp);
  registerPassportPhoto(fakeApp);
  registerRedEyeRemoval(fakeApp);
  registerRestorePhoto(fakeApp);
  registerTransparencyFixer(fakeApp);
  registerUpscale(fakeApp);
  registerRemoveGifBackground(fakeApp);
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isToolInstalled.mockReturnValue(true);
  mocks.isFeatureInstalled.mockReturnValue(true);
  mocks.cancelSingleJobGuarded.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deletePrefix.mockResolvedValue(undefined);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.insertToolJobAlias.mockResolvedValue(true);
  mocks.enqueueToolJob.mockResolvedValue({});
  mocks.waitForJob.mockResolvedValue(null);
  mocks.dbInsertValues.mockResolvedValue(undefined);
  mocks.updateSingleFileProgress.mockResolvedValue(undefined);
  mocks.getObjectBuffer.mockResolvedValue(validPng);
  mocks.outpaint.mockResolvedValue(validPng);
  mocks.blurFaces.mockResolvedValue({ buffer: validPng, facesDetected: 1, faces: [] });
  mocks.removeRedEye.mockResolvedValue({
    buffer: validPng,
    facesDetected: 1,
    eyesCorrected: 2,
    width: 16,
    height: 16,
    format: "png",
  });
  mocks.seamCarve.mockResolvedValue({ buffer: validPng, width: 12, height: 12 });
  mocks.detectFaceLandmarks.mockResolvedValue({
    faceDetected: true,
    landmarks: {
      leftEye: { x: 0.35, y: 0.4 },
      rightEye: { x: 0.65, y: 0.4 },
      eyeCenter: { x: 0.5, y: 0.4 },
      chin: { x: 0.5, y: 0.8 },
      forehead: { x: 0.5, y: 0.25 },
      crown: { x: 0.5, y: 0.15 },
      nose: { x: 0.5, y: 0.55 },
      faceCenterX: 0.5,
    },
    imageWidth: 16,
    imageHeight: 16,
  });
  mocks.removeBackground.mockResolvedValue(validPng);
  mocks.receiveUpload.mockImplementation(
    (part: { filename?: string }, jobId: string, opts?: { uniqueName?: (n: string) => string }) => {
      const raw = part.filename ?? "photo.png";
      const filename = opts?.uniqueName ? opts.uniqueName(raw) : raw;
      return Promise.resolve({ key: `uploads/${jobId}/${filename}`, filename, size: 100 });
    },
  );
});

function makeReply() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    headers,
    payload: undefined as unknown,
    raw: { destroyed: false, writableEnded: false, once: vi.fn(), removeListener: vi.fn() },
    header(key: string, val: string) {
      headers[key.toLowerCase()] = val;
      return this;
    },
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
        if (p.type === "file" && Buffer.isBuffer(p.content)) {
          yield {
            ...p,
            file: Readable.from([p.content]),
          };
        } else {
          yield p;
        }
      }
    },
  };
}

const ASYNC_SINGLE_IMAGE_ROUTES: Array<{
  toolId: string;
  path: string;
  extraFields?: Array<{ type: "field"; fieldname: string; value: string }>;
}> = [
  { toolId: "remove-background", path: "/api/v1/tools/image/remove-background" },
  {
    toolId: "ai-canvas-expand",
    path: "/api/v1/tools/image/ai-canvas-expand",
    extraFields: [
      { type: "field", fieldname: "settings", value: JSON.stringify({ extendTop: 8 }) },
    ],
  },
  { toolId: "blur-faces", path: "/api/v1/tools/image/blur-faces" },
  { toolId: "background-replace", path: "/api/v1/tools/image/background-replace" },
  { toolId: "blur-background", path: "/api/v1/tools/image/blur-background" },
  { toolId: "colorize", path: "/api/v1/tools/image/colorize" },
  { toolId: "enhance-faces", path: "/api/v1/tools/image/enhance-faces" },
  { toolId: "noise-removal", path: "/api/v1/tools/image/noise-removal" },
  { toolId: "red-eye-removal", path: "/api/v1/tools/image/red-eye-removal" },
  { toolId: "restore-photo", path: "/api/v1/tools/image/restore-photo" },
  { toolId: "transparency-fixer", path: "/api/v1/tools/image/transparency-fixer" },
  { toolId: "upscale", path: "/api/v1/tools/image/upscale" },
];

describe("custom AI image routes input decode, fileExt, SVG prep, and error logging (#3313)", () => {
  it.each(ASYNC_SINGLE_IMAGE_ROUTES)(
    "$toolId returns 422 without request.log.error on corrupt .tga upload",
    async ({ path, extraFields = [] }) => {
      mocks.getObjectBuffer.mockResolvedValueOnce(Buffer.from("not an image"));
      const req = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.tga", file: {} },
        ...extraFields,
      ]);
      const reply = makeReply();

      await handlers[path](req, reply);

      expect(reply.statusCode).toBe(422);
      expect(req.log.error).not.toHaveBeenCalled();
    },
  );

  it.each(ASYNC_SINGLE_IMAGE_ROUTES)(
    "$toolId forwards lowercase fileExt to decodeToSharpCompat and rewrites filename to .png",
    async ({ path, extraFields = [] }) => {
      const cliSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockResolvedValueOnce(validPng);
      try {
        const rawBytes = Buffer.from("fake-raw-header");
        mocks.getObjectBuffer.mockResolvedValueOnce(rawBytes);
        const req = makeRequest([
          { type: "file", fieldname: "file", filename: "shot.CR3", file: {} },
          ...extraFields,
        ]);
        const reply = makeReply();

        await handlers[path](req, reply);

        expect(reply.statusCode).toBe(202);
        expect(cliSpy).toHaveBeenCalledWith(rawBytes, "raw", "cr3");
        const jobData = mocks.enqueueToolJob.mock.calls[0]?.[0] as { filename: string };
        expect(jobData.filename).toBe("shot.png");
      } finally {
        cliSpy.mockRestore();
      }
    },
  );

  it.each(ASYNC_SINGLE_IMAGE_ROUTES)(
    "$toolId decompresses, sanitizes, and rasterizes .svgz uploads and returns 400 on invalid SVG/SVGZ",
    async ({ path, extraFields = [] }) => {
      const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
      const orientSpy = vi.spyOn(autoOrientModule, "autoOrient");
      try {
        const rawSvg = Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script><rect width="16" height="16" fill="#00ff00"/></svg>',
        );
        const svgz = gzipSync(rawSvg);
        mocks.getObjectBuffer.mockResolvedValueOnce(svgz);

        const req = makeRequest([
          { type: "file", fieldname: "file", filename: "icon.svgz", file: {} },
          ...extraFields,
        ]);
        const reply = makeReply();

        await handlers[path](req, reply);

        expect(reply.statusCode).toBe(202);
        expect(sanitizeSpy).toHaveBeenCalledTimes(1);
        expect(orientSpy).not.toHaveBeenCalled();
        const stagedBuf = mocks.putObject.mock.calls[0]?.[1] as Buffer;
        expect((await sharp(stagedBuf).metadata()).format).toBe("png");
        const jobData = mocks.enqueueToolJob.mock.calls[0]?.[0] as { filename: string };
        expect(jobData.filename).toBe("icon.png");

        // Invalid SVGZ (non-SVG content after gunzip) -> 400 without request.log.error
        const badSvgz = gzipSync(Buffer.from("<html>not svg</html>"));
        mocks.getObjectBuffer.mockResolvedValueOnce(badSvgz);
        const badReq = makeRequest([
          { type: "file", fieldname: "file", filename: "bad.svgz", file: {} },
          ...extraFields,
        ]);
        const badReply = makeReply();

        await handlers[path](badReq, badReply);

        expect(badReply.statusCode).toBe(400);
        expect(badReq.log.error).not.toHaveBeenCalled();

        // V8 buffer allocation RangeError in decompressSvgz/sanitizeSvg surfaces DecoderOutOfMemoryError (#3675)
        const v8Oom = new RangeError("Array buffer allocation failed");
        sanitizeSpy.mockImplementationOnce(() => {
          throw v8Oom;
        });
        mocks.getObjectBuffer.mockResolvedValueOnce(svgz);
        const oomReq = makeRequest([
          { type: "file", fieldname: "file", filename: "icon.svgz", file: {} },
          ...extraFields,
        ]);
        const oomReply = makeReply();
        await expect(handlers[path](oomReq, oomReply)).rejects.toBeInstanceOf(
          formatDecoders.DecoderOutOfMemoryError,
        );
      } finally {
        sanitizeSpy.mockRestore();
        orientSpy.mockRestore();
      }
    },
  );

  it("erase-object forwards fileExt for both image and mask, sanitizes/rasterizes SVG masks, and suppresses request.log.error on corrupt .tga", async () => {
    const cliSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValue(validPng);
    try {
      const rawImage = Buffer.from("fake-cr3-image");
      const rawMask = Buffer.from("fake-raf-mask");
      mocks.getObjectBuffer.mockImplementation(async (key: string) =>
        key.includes("mask") ? rawMask : rawImage,
      );
      const req = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.CR3", file: {} },
        { type: "file", fieldname: "mask", filename: "mask.RAF", file: {} },
      ]);
      const reply = makeReply();

      await handlers["/api/v1/tools/image/erase-object"](req, reply);

      expect(reply.statusCode).toBe(202);
      expect(cliSpy).toHaveBeenNthCalledWith(1, rawImage, "raw", "cr3");
      expect(cliSpy).toHaveBeenNthCalledWith(2, rawMask, "raw", "raf");
    } finally {
      cliSpy.mockRestore();
    }

    // Corrupt .tga mask returns 422 without request.log.error
    mocks.getObjectBuffer.mockImplementation(async (key: string) =>
      key.includes("mask") ? Buffer.from("not a tga mask") : validPng,
    );
    const badReq = makeRequest([
      { type: "file", fieldname: "file", filename: "photo.png", file: {} },
      { type: "file", fieldname: "mask", filename: "mask.tga", file: {} },
    ]);
    const badReply = makeReply();

    await handlers["/api/v1/tools/image/erase-object"](badReq, badReply);

    expect(badReply.statusCode).toBe(422);
    expect(badReq.log.error).not.toHaveBeenCalled();

    // .svgz mask is decompressed, sanitized, and rasterized to PNG; invalid .svgz mask returns 400
    const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
    try {
      mocks.putObject.mockClear();
      const svgzMask = gzipSync(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script><rect width="16" height="16" fill="#ffffff"/></svg>',
        ),
      );
      mocks.getObjectBuffer.mockImplementation(async (key: string) =>
        key.includes("mask") ? svgzMask : validPng,
      );
      const svgMaskReq = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.png", file: {} },
        { type: "file", fieldname: "mask", filename: "mask.svgz", file: {} },
      ]);
      const svgMaskReply = makeReply();

      await handlers["/api/v1/tools/image/erase-object"](svgMaskReq, svgMaskReply);

      expect(svgMaskReply.statusCode).toBe(202);
      expect(sanitizeSpy).toHaveBeenCalledTimes(1);
      const stagedMaskBuf = mocks.putObject.mock.calls.find(([k]) =>
        String(k).includes("mask"),
      )?.[1] as Buffer;
      expect((await sharp(stagedMaskBuf).metadata()).format).toBe("png");

      const badSvgzMask = gzipSync(Buffer.from("<html>not an svg mask</html>"));
      mocks.getObjectBuffer.mockImplementation(async (key: string) =>
        key.includes("mask") ? badSvgzMask : validPng,
      );
      const badSvgMaskReq = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.png", file: {} },
        { type: "file", fieldname: "mask", filename: "mask.svgz", file: {} },
      ]);
      const badSvgMaskReply = makeReply();

      await handlers["/api/v1/tools/image/erase-object"](badSvgMaskReq, badSvgMaskReply);

      expect(badSvgMaskReply.statusCode).toBe(400);
      expect(badSvgMaskReq.log.error).not.toHaveBeenCalled();
    } finally {
      sanitizeSpy.mockRestore();
    }
  });

  it("passport-photo/analyze forwards fileExt, sanitizes/rasterizes SVGZ, and suppresses request.log.error on corrupt .tga", async () => {
    const cliSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValueOnce(validPng);
    try {
      const req = makeRequest([
        {
          type: "file",
          fieldname: "file",
          filename: "portrait.CR3",
          content: Buffer.from("fake-raw-header"),
        },
      ]);
      const reply = makeReply();

      await handlers["/api/v1/tools/image/passport-photo/analyze"](req, reply);

      expect(reply.statusCode).toBe(200);
      expect(cliSpy).toHaveBeenCalledWith(Buffer.from("fake-raw-header"), "raw", "cr3");
    } finally {
      cliSpy.mockRestore();
    }

    // Corrupt .tga upload returns 422 without request.log.error
    const badReq = makeRequest([
      {
        type: "file",
        fieldname: "file",
        filename: "portrait.tga",
        content: Buffer.from("not an image"),
      },
    ]);
    const badReply = makeReply();

    await handlers["/api/v1/tools/image/passport-photo/analyze"](badReq, badReply);

    expect(badReply.statusCode).toBe(422);
    expect(badReq.log.error).not.toHaveBeenCalled();
  });

  it("image-enhancement/analyze and optimize-for-web/preview forward fileExt to decodeToSharpCompat and image-enhancement/analyze prepares SVGZ", async () => {
    const cliSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValue(validPng);
    try {
      const enhReq = makeRequest([
        {
          type: "file",
          fieldname: "file",
          filename: "scene.CR3",
          content: Buffer.from("fake-raw-header"),
        },
      ]);
      const enhReply = makeReply();
      await handlers["/api/v1/tools/image/image-enhancement/analyze"](enhReq, enhReply);
      expect(enhReply.statusCode).toBe(200);
      expect(cliSpy).toHaveBeenCalledWith(Buffer.from("fake-raw-header"), "raw", "cr3");

      const optReq = makeRequest([
        {
          type: "file",
          fieldname: "file",
          filename: "scene.RAF",
          content: Buffer.from("fake-raw-header"),
        },
      ]);
      const optReply = makeReply();
      await handlers["/api/v1/tools/image/optimize-for-web/preview"](optReq, optReply);
      expect(optReply.statusCode).toBe(200);
      expect(cliSpy).toHaveBeenCalledWith(Buffer.from("fake-raw-header"), "raw", "raf");
    } finally {
      cliSpy.mockRestore();
    }

    // image-enhancement/analyze and optimize-for-web/preview decompress and sanitize .svgz, reject invalid .svgz with 400, and suppress request.log.error on corrupt .tga
    const svgz = gzipSync(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script><rect width="16" height="16" fill="#336699"/></svg>',
      ),
    );
    for (const route of [
      "/api/v1/tools/image/image-enhancement/analyze",
      "/api/v1/tools/image/optimize-for-web/preview",
    ] as const) {
      const svgzReq = makeRequest([
        { type: "file", fieldname: "file", filename: "graphic.svgz", content: svgz },
      ]);
      const svgzReply = makeReply();
      await handlers[route](svgzReq, svgzReply);
      expect(svgzReply.statusCode).toBe(200);

      const badSvgz = gzipSync(Buffer.from("<html>not svg</html>"));
      const badSvgReq = makeRequest([
        { type: "file", fieldname: "file", filename: "bad.svgz", content: badSvgz },
      ]);
      const badSvgReply = makeReply();
      await handlers[route](badSvgReq, badSvgReply);
      expect(badSvgReply.statusCode).toBe(400);
      expect(badSvgReq.log.error).not.toHaveBeenCalled();

      const badTgaReq = makeRequest([
        {
          type: "file",
          fieldname: "file",
          filename: "corrupt.tga",
          content: Buffer.from("not an image"),
        },
      ]);
      const badTgaReply = makeReply();
      await handlers[route](badTgaReq, badTgaReply);
      expect(badTgaReply.statusCode).toBe(422);
      expect(badTgaReq.log.error).not.toHaveBeenCalled();
    }
  });

  it("routes validateImageBuffer and analyzeImage OOMs and 5xx faults through sendInputValidationError on image-enhancement/analyze and optimize-for-web/preview (#3831)", async () => {
    let fakeNow = Date.now() + 30 * 60_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNow);

    try {
      // 1. validateImageBuffer rejecting with DecoderOutOfMemoryError (from sharp.prototype.metadata OOM) on both routes
      for (const [route, toolId] of [
        ["/api/v1/tools/image/optimize-for-web/preview", "optimize-for-web"],
        ["/api/v1/tools/image/image-enhancement/analyze", "image-enhancement"],
      ] as const) {
        fakeNow += 11 * 60_000;
        mocks.reportError.mockClear();
        const metaSpy = vi
          .spyOn(sharp.prototype, "metadata")
          .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
          .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"));
        try {
          const warnSpy = vi.fn();
          for (let attempt = 0; attempt < 2; attempt++) {
            const req = makeRequest([
              { type: "file", fieldname: "file", filename: "photo.png", content: validPng },
            ]);
            req.log.warn = warnSpy;
            const reply = makeReply();
            await handlers[route](req, reply);
            expect(reply.statusCode).toBe(503);
            expect(reply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
          }
          expect(warnSpy).toHaveBeenCalledTimes(1);
          expect(warnSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              code: "ENGINE_UNAVAILABLE",
              cause: "DecoderOutOfMemoryError",
              toolId,
            }),
            "Tool engine unavailable during input preparation",
          );
          expect(mocks.reportError).toHaveBeenCalledTimes(1);
        } finally {
          metaSpy.mockRestore();
        }

        // validateImageBuffer 5xx SafeError routes through sendInputValidationError, while unexpected non-5xx rethrows
        fakeNow += 11 * 60_000;
        mocks.reportError.mockClear();
        const storageFullErr = Object.assign(new Error("The server's storage is full."), {
          isSafeMessage: true,
          statusCode: 503,
          code: "storage-full",
        });
        vi.mocked(fileValidation.validateImageBuffer).mockRejectedValueOnce(storageFullErr);
        const req503 = makeRequest([
          { type: "file", fieldname: "file", filename: "photo.png", content: validPng },
        ]);
        const reply503 = makeReply();
        await handlers[route](req503, reply503);
        expect(reply503.statusCode).toBe(503);
        expect(reply503.payload).toEqual({
          error: "The server's storage is full.",
          code: "storage-full",
        });

        const unexpectedValidateErr = new TypeError("unexpected validator fault");
        vi.mocked(fileValidation.validateImageBuffer).mockRejectedValueOnce(unexpectedValidateErr);
        const reqUnexpected = makeRequest([
          { type: "file", fieldname: "file", filename: "photo.png", content: validPng },
        ]);
        await expect(handlers[route](reqUnexpected, makeReply())).rejects.toBe(
          unexpectedValidateErr,
        );
      }

      // 2. analyzeImage rejecting with DecoderOutOfMemoryError (from sharp.prototype.stats OOM) on image-enhancement/analyze
      fakeNow += 11 * 60_000;
      mocks.reportError.mockClear();
      const statsSpy = vi
        .spyOn(sharp.prototype, "stats")
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"))
        .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"));
      try {
        const warnAnalyzeOom = vi.fn();
        for (let attempt = 0; attempt < 2; attempt++) {
          const req = makeRequest([
            { type: "file", fieldname: "file", filename: "photo.png", content: validPng },
          ]);
          req.log.warn = warnAnalyzeOom;
          const reply = makeReply();
          await handlers["/api/v1/tools/image/image-enhancement/analyze"](req, reply);
          expect(reply.statusCode).toBe(503);
          expect(reply.payload).toMatchObject({ code: "ENGINE_UNAVAILABLE" });
        }
        expect(warnAnalyzeOom).toHaveBeenCalledTimes(1);
        expect(warnAnalyzeOom).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "ENGINE_UNAVAILABLE",
            cause: "DecoderOutOfMemoryError",
            toolId: "image-enhancement",
          }),
          "Tool engine unavailable during input preparation",
        );
        expect(mocks.reportError).toHaveBeenCalledTimes(1);
      } finally {
        statsSpy.mockRestore();
      }

      // Non-ENGINE_UNAVAILABLE 5xx error in analyzeImage still rethrows
      const statsEnospcSpy = vi
        .spyOn(sharp.prototype, "stats")
        .mockRejectedValueOnce(
          Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }),
        );
      try {
        const reqEnospc = makeRequest([
          { type: "file", fieldname: "file", filename: "photo.png", content: validPng },
        ]);
        await expect(
          handlers["/api/v1/tools/image/image-enhancement/analyze"](reqEnospc, makeReply()),
        ).rejects.toMatchObject({
          statusCode: 503,
          code: "storage-full",
        });
      } finally {
        statsEnospcSpy.mockRestore();
      }
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("remove-gif-background decodes, sanitizes, orients, and stages backgroundImage as PNG (#3313)", async () => {
    mocks.getObjectBuffer.mockResolvedValue(GIF);
    const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
    const heicSpy = vi.spyOn(heicConverter, "decodeHeic").mockResolvedValueOnce(validPng);
    const cliSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValueOnce(validPng);
    try {
      // 1. .svgz backgroundImage is decompressed, sanitized, and staged as PNG with .png key
      const svgzBg = gzipSync(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script><rect width="16" height="16" fill="#00ff00"/></svg>',
        ),
      );
      const svgzReq = makeRequest([
        { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
        { type: "file", fieldname: "backgroundImage", filename: "bg.svgz", content: svgzBg },
        {
          type: "field",
          fieldname: "settings",
          value: JSON.stringify({ backgroundType: "image" }),
        },
      ]);
      const svgzReply = makeReply();
      await handlers["/api/v1/tools/image/remove-gif-background"](svgzReq, svgzReply);

      expect(svgzReply.statusCode).toBe(202);
      expect(sanitizeSpy).toHaveBeenCalledTimes(1);
      const [stagedSvgKey, stagedSvgBg] = mocks.putObject.mock.calls[0] as [string, Buffer];
      expect(stagedSvgKey).toMatch(/\/bg-bg\.png$/);
      expect((await sharp(stagedSvgBg).metadata()).format).toBe("png");

      // 2. .heic backgroundImage is decoded via decodeHeic
      mocks.putObject.mockClear();
      const heicReq = makeRequest([
        { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
        { type: "file", fieldname: "backgroundImage", filename: "bg.heic", content: HEIC },
        {
          type: "field",
          fieldname: "settings",
          value: JSON.stringify({ backgroundType: "image" }),
        },
      ]);
      const heicReply = makeReply();
      await handlers["/api/v1/tools/image/remove-gif-background"](heicReq, heicReply);

      expect(heicReply.statusCode).toBe(202);
      expect(heicSpy).toHaveBeenCalledTimes(1);
      const stagedHeicBg = mocks.putObject.mock.calls[0]?.[1] as Buffer;
      expect((await sharp(stagedHeicBg).metadata()).format).toBe("png");

      // 3. .CR3 backgroundImage forwards lowercase fileExt ("cr3") to decodeToSharpCompat
      const cr3Bytes = Buffer.from("fake-raw-header");
      const cr3Req = makeRequest([
        { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
        { type: "file", fieldname: "backgroundImage", filename: "bg.CR3", content: cr3Bytes },
        {
          type: "field",
          fieldname: "settings",
          value: JSON.stringify({ backgroundType: "image" }),
        },
      ]);
      const cr3Reply = makeReply();
      await handlers["/api/v1/tools/image/remove-gif-background"](cr3Req, cr3Reply);

      expect(cr3Reply.statusCode).toBe(202);
      expect(cliSpy).toHaveBeenCalledWith(cr3Bytes, "raw", "cr3");

      // 4. Invalid .svgz backgroundImage returns 400 without request.log.error
      const badSvgBgReq = makeRequest([
        { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
        {
          type: "file",
          fieldname: "backgroundImage",
          filename: "bg.svgz",
          content: gzipSync(Buffer.from("<html>not svg</html>")),
        },
        {
          type: "field",
          fieldname: "settings",
          value: JSON.stringify({ backgroundType: "image" }),
        },
      ]);
      const badSvgBgReply = makeReply();
      await handlers["/api/v1/tools/image/remove-gif-background"](badSvgBgReq, badSvgBgReply);

      expect(badSvgBgReply.statusCode).toBe(400);
      expect(badSvgBgReq.log.error).not.toHaveBeenCalled();

      // 5. Corrupt .tga backgroundImage returns 422 without request.log.error
      const badBgReq = makeRequest([
        { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
        {
          type: "file",
          fieldname: "backgroundImage",
          filename: "bg.tga",
          content: Buffer.from("not an image"),
        },
        {
          type: "field",
          fieldname: "settings",
          value: JSON.stringify({ backgroundType: "image" }),
        },
      ]);
      const badBgReply = makeReply();
      await handlers["/api/v1/tools/image/remove-gif-background"](badBgReq, badBgReply);

      expect(badBgReply.statusCode).toBe(422);
      expect(badBgReq.log.error).not.toHaveBeenCalled();

      // 6. V8 OOM in detectAnimation (second sharp.prototype.metadata call after validateImageBuffer) rethrows DecoderOutOfMemoryError instead of returning 400 (#3812)
      const origMetadata = sharp.prototype.metadata;
      const v8Oom = new RangeError("Array buffer allocation failed");
      const corruptMetaErr = new Error("Input buffer has corrupt header: gifload");
      let metaCalls = 0;
      const metaSpy = vi.spyOn(sharp.prototype, "metadata").mockImplementation(function (
        this: sharp.Sharp,
        ...args: Parameters<typeof origMetadata>
      ) {
        metaCalls++;
        if (metaCalls === 2) {
          return Promise.reject(v8Oom);
        }
        if (metaCalls === 4) {
          return Promise.reject(corruptMetaErr);
        }
        return origMetadata.apply(this, args);
      });
      try {
        mocks.deletePrefix.mockClear();
        const oomReq = makeRequest([
          { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
        ]);
        const oomReply = makeReply();
        const err = await handlers["/api/v1/tools/image/remove-gif-background"](
          oomReq,
          oomReply,
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(formatDecoders.DecoderOutOfMemoryError);
        expect(err).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: v8Oom,
        });
        expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);

        const corruptReq = makeRequest([
          { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
        ]);
        const corruptReply = makeReply();
        await handlers["/api/v1/tools/image/remove-gif-background"](corruptReq, corruptReply);
        expect(corruptReply.statusCode).toBe(400);
        expect(corruptReply.payload).toEqual({
          error: "Invalid image: Input buffer has corrupt header: gifload",
        });
      } finally {
        metaSpy.mockRestore();
      }

      // 7. V8 OOM in Buffer.concat while reading backgroundImage rethrows DecoderOutOfMemoryError via multipartFailure (#3898)
      const v8ConcatOom = new RangeError("Array buffer allocation failed");
      const concatSpy = vi.spyOn(Buffer, "concat").mockImplementationOnce(() => {
        throw v8ConcatOom;
      });
      try {
        mocks.deletePrefix.mockClear();
        const bgOomReq = makeRequest([
          { type: "file", fieldname: "file", filename: "anim.gif", file: {} },
          { type: "file", fieldname: "backgroundImage", filename: "bg.png", content: validPng },
        ]);
        const bgOomReply = makeReply();
        const err = await handlers["/api/v1/tools/image/remove-gif-background"](
          bgOomReq,
          bgOomReply,
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(formatDecoders.DecoderOutOfMemoryError);
        expect(err).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: v8ConcatOom,
        });
        expect(mocks.deletePrefix).toHaveBeenCalledTimes(1);
      } finally {
        concatSpy.mockRestore();
      }

      // 8. V8 OOM in Buffer.concat while reading backgroundImage in remove-background/effects rethrows DecoderOutOfMemoryError via multipartFailure (#3898)
      const effectsConcatSpy = vi.spyOn(Buffer, "concat").mockImplementationOnce(() => {
        throw v8ConcatOom;
      });
      try {
        const effectsOomReq = makeRequest([
          { type: "file", fieldname: "backgroundImage", filename: "bg.png", content: validPng },
        ]);
        const effectsOomReply = makeReply();
        const err = await handlers["/api/v1/tools/image/remove-background/effects"](
          effectsOomReq,
          effectsOomReply,
        ).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(formatDecoders.DecoderOutOfMemoryError);
        expect(err).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: v8ConcatOom,
        });
      } finally {
        effectsConcatSpy.mockRestore();
      }
    } finally {
      sanitizeSpy.mockRestore();
      heicSpy.mockRestore();
      cliSpy.mockRestore();
    }
  });

  it.each([
    ["ai-canvas-expand", { extendRight: 8, format: "png", quality: 90 }],
    ["blur-faces", { blurRadius: 20, sensitivity: 0.5 }],
    ["content-aware-resize", { width: 12 }],
    ["red-eye-removal", { sensitivity: 50, strength: 70 }],
  ] as const)(
    "%s pipeline process fn forwards fileExt to decodeToSharpCompat, sanitizes/rasterizes .svgz, and classifies corrupt CLI input as ToolInputError",
    async (toolId, settings) => {
      const config = getToolConfig(toolId);
      if (!config) throw new Error(`${toolId} missing from toolRegistry`);

      const cliSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockResolvedValueOnce(validPng);
      try {
        const rawBytes = Buffer.from("fake-raw-header");
        await config.process(rawBytes, settings, "camera.CR3");
        expect(cliSpy).toHaveBeenCalledWith(rawBytes, "raw", "cr3");
      } finally {
        cliSpy.mockRestore();
      }

      const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
      try {
        const svgz = gzipSync(
          Buffer.from(
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script><rect width="16" height="16" fill="#00ff00"/></svg>',
          ),
        );
        await config.process(svgz, settings, "graphic.svgz");
        expect(sanitizeSpy).toHaveBeenCalledTimes(1);

        const badSvgz = gzipSync(Buffer.from("<html>not svg</html>"));
        const svgErr = await config.process(badSvgz, settings, "bad.svgz").catch((e: unknown) => e);
        expect(svgErr).toBeInstanceOf(InputValidationError);

        const v8Oom = new RangeError("Array buffer allocation failed");
        sanitizeSpy.mockImplementationOnce(() => {
          throw v8Oom;
        });
        const oomErr = await config
          .process(svgz, settings, "graphic.svgz")
          .catch((e: unknown) => e);
        expect(oomErr).toBeInstanceOf(formatDecoders.DecoderOutOfMemoryError);
        expect((oomErr as { cause?: unknown }).cause).toBe(v8Oom);
      } finally {
        sanitizeSpy.mockRestore();
      }

      const err = await config
        .process(Buffer.from("not an image"), settings, "corrupt.tga")
        .catch((e: unknown) => e);
      expect(isToolInputError(err)).toBe(true);

      // #3540: extensionless or dotfile filenames ("heic", ".heic", "svg", ".svg")
      // that fail validateImageBuffer must not set ext to the bare stem and invoke
      // decodeHeic or sanitizeSvg, whereas dotted uppercase extensions (.HEIC, .SVG)
      // still strip the leading dot and lowercase before matching.
      const heicSpy = vi
        .spyOn(heicConverter, "decodeHeic")
        .mockRejectedValueOnce(new Error("invalid heic"));
      const svgSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
      try {
        for (const bareOrDotfile of ["heic", ".heic", "svg", ".svg"]) {
          await config
            .process(Buffer.from("not an image"), settings, bareOrDotfile)
            .catch(() => null);
        }
        expect(heicSpy).not.toHaveBeenCalled();
        expect(svgSpy).not.toHaveBeenCalled();

        await config
          .process(Buffer.from("not an image"), settings, ".hidden.HEIC")
          .catch(() => null);
        expect(heicSpy).toHaveBeenCalledTimes(1);

        const commentPaddedSvg = Buffer.from(
          `<!-- ${"x".repeat(4500)} --><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>`,
        );
        await config.process(commentPaddedSvg, settings, ".hidden.SVG");
        expect(svgSpy).toHaveBeenCalledTimes(1);
      } finally {
        heicSpy.mockRestore();
        svgSpy.mockRestore();
      }
    },
  );

  it("edit-metadata pipeline process fn extracts extension with extname instead of split('.').pop() (#3540)", async () => {
    const config = getToolConfig("edit-metadata");
    if (!config) throw new Error("edit-metadata missing from toolRegistry");

    const jpegBytes = await sharp(validPng).jpeg().toBuffer();
    for (const extlessName of ["png", ".png", "webp", ".webp", "photo."]) {
      const res = await config.process(jpegBytes, {}, extlessName);
      expect(res.contentType, `${extlessName} should fall back to image/jpeg`).toBe("image/jpeg");
    }

    const pngRes = await config.process(validPng, {}, "photo.PNG");
    expect(pngRes.contentType).toBe("image/png");
  });

  it("handles comment-padded SVGs (.apng / .tga), svgLimitError 400, DecoderUnavailableError 503, and ENOSPC 503 across prepareRouteImage and routes (#3313)", async () => {
    const sanitizeSpy = vi.spyOn(svgSanitize, "sanitizeSvg");
    try {
      const longComment = `<!-- ${"x".repeat(4500)} -->`;
      const commentPaddedSvg = Buffer.from(
        `${longComment}<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><script>alert(1)</script><rect width="16" height="16" fill="#00ff00"/></svg>`,
      );

      // 1. Comment-padded .apng and .tga uploads run sanitizeSvg and rasterize to PNG
      mocks.getObjectBuffer.mockResolvedValueOnce(commentPaddedSvg);
      const apngReq = makeRequest([
        { type: "file", fieldname: "file", filename: "padded.apng", file: {} },
      ]);
      const apngReply = makeReply();
      await handlers["/api/v1/tools/image/remove-background"](apngReq, apngReply);
      expect(apngReply.statusCode).toBe(202);
      expect(sanitizeSpy).toHaveBeenCalledTimes(1);

      mocks.getObjectBuffer.mockResolvedValueOnce(commentPaddedSvg);
      const tgaSvgReq = makeRequest([
        { type: "file", fieldname: "file", filename: "padded.tga", file: {} },
      ]);
      const tgaSvgReply = makeReply();
      await handlers["/api/v1/tools/image/upscale"](tgaSvgReq, tgaSvgReply);
      expect(tgaSvgReply.statusCode).toBe(202);
      expect(sanitizeSpy).toHaveBeenCalledTimes(2);
    } finally {
      sanitizeSpy.mockRestore();
    }

    // 2. SVG exceeding element cap returns 400 (and settles clientJobId on passport-photo/analyze)
    const tooManyElementsSvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${"<rect/>".repeat(5005)}</svg>`,
    );
    const passportBombReq = makeRequest([
      {
        type: "file",
        fieldname: "file",
        filename: "bomb.svg",
        content: tooManyElementsSvg,
      },
      {
        type: "field",
        fieldname: "clientJobId",
        value: "11111111-1111-4111-8111-111111111111",
      },
    ]);
    const passportBombReply = makeReply();
    await handlers["/api/v1/tools/image/passport-photo/analyze"](
      passportBombReq,
      passportBombReply,
    );
    expect(passportBombReply.statusCode).toBe(400);
    expect((passportBombReply.payload as { error: string }).error).toContain(
      "maximum element count",
    );
    expect(passportBombReq.log.error).not.toHaveBeenCalled();
    expect(mocks.updateSingleFileProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "11111111-1111-4111-8111-111111111111",
        phase: "failed",
      }),
    );

    // 3. DecoderUnavailableError and ENOSPC rethrow for the error handler
    const unavailableErr = new formatDecoders.DecoderUnavailableError("No magick found");
    const cliUnavailSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValue(unavailableErr);
    try {
      mocks.getObjectBuffer.mockResolvedValueOnce(Buffer.from("not an image"));
      const req503 = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.tga", file: {} },
      ]);
      const reply503 = makeReply();
      await expect(handlers["/api/v1/tools/image/upscale"](req503, reply503)).rejects.toBe(
        unavailableErr,
      );
      expect(isToolInputError(unavailableErr)).toBe(false);

      // #2801: TIFF-headed RAW (CR2) passes sharp(buf).metadata() but fails pixel decode;
      // prepareRouteImage must still rethrow DecoderUnavailableError instead of keeping the undecoded RAW buffer.
      const cr2Bytes = readFixture(fixtures.image.formats("cr2"));
      mocks.getObjectBuffer.mockResolvedValueOnce(cr2Bytes);
      const reqCr2503 = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.cr2", file: {} },
      ]);
      const replyCr2503 = makeReply();
      await expect(handlers["/api/v1/tools/image/upscale"](reqCr2503, replyCr2503)).rejects.toBe(
        unavailableErr,
      );

      // Disguised comment-padded SVG exceeding element cap with .tga extension still hits
      // sanitizeSvg (400) rather than rasterizing unsanitized SVG in the CLI pixel probe.
      const commentPaddedBombSvg = Buffer.from(
        `<!-- ${"x".repeat(4500)} --><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">${"<rect/>".repeat(5005)}</svg>`,
      );
      mocks.getObjectBuffer.mockResolvedValueOnce(commentPaddedBombSvg);
      const reqTgaBomb = makeRequest([
        { type: "file", fieldname: "file", filename: "bomb.tga", file: {} },
      ]);
      const replyTgaBomb = makeReply();
      await handlers["/api/v1/tools/image/upscale"](reqTgaBomb, replyTgaBomb);
      expect(replyTgaBomb.statusCode).toBe(400);
      expect((replyTgaBomb.payload as { error: string }).error).toContain("maximum element count");
    } finally {
      cliUnavailSpy.mockRestore();
    }

    const enospc = Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    const heicEnospcSpy = vi.spyOn(heicConverter, "decodeHeic").mockRejectedValueOnce(enospc);
    try {
      mocks.getObjectBuffer.mockResolvedValueOnce(HEIC);
      const reqEnospc = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.heic", file: {} },
      ]);
      const replyEnospc = makeReply();
      const caught = await handlers["/api/v1/tools/image/remove-background"](
        reqEnospc,
        replyEnospc,
      ).catch((e: unknown) => e);
      expect((caught as { statusCode?: number; code?: string }).statusCode).toBe(503);
      expect((caught as { code?: string }).code).toBe("storage-full");
      expect(isToolInputError(enospc)).toBe(false);
    } finally {
      heicEnospcSpy.mockRestore();
    }

    // 4. Non-InputValidationError (unexpected runtime error) in sanitizeSvg logs request.log.error and returns 422
    const unexpectedSvgErr = new Error("unexpected sanitizer failure");
    const sanitizeThrowSpy = vi.spyOn(svgSanitize, "sanitizeSvg").mockImplementationOnce(() => {
      throw unexpectedSvgErr;
    });
    try {
      const validSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>',
      );
      mocks.getObjectBuffer.mockResolvedValueOnce(validSvg);
      const reqUnexpected = makeRequest([
        { type: "file", fieldname: "file", filename: "icon.svg", file: {} },
      ]);
      const replyUnexpected = makeReply();
      await handlers["/api/v1/tools/image/colorize"](reqUnexpected, replyUnexpected);
      expect(replyUnexpected.statusCode).toBe(422);
      expect(reqUnexpected.log.error).toHaveBeenCalledTimes(1);
    } finally {
      sanitizeThrowSpy.mockRestore();
    }

    // 5. Extensionless CLI-decoded filename forwards undefined fileExt and preserves extensionless filename
    const extlessCliSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockResolvedValueOnce(validPng);
    try {
      const rawBytes = Buffer.from("fake-raw-header");
      const prepared = await prepareRouteImage(rawBytes, "shot", "raw", {
        rewriteFilenameToPng: true,
      });
      expect(extlessCliSpy).toHaveBeenCalledWith(rawBytes, "raw", undefined);
      expect(prepared.filename).toBe("shot");
    } finally {
      extlessCliSpy.mockRestore();
    }

    // 6. DecoderOutOfMemoryError rethrows from prepareRouteImage without falling back to Sharp metadata
    const oomErr = new formatDecoders.DecoderOutOfMemoryError("dcraw_emu OOM");
    const cliOomSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockRejectedValueOnce(oomErr);
    try {
      await expect(prepareRouteImage(validPng, "photo.dng", "raw")).rejects.toBe(oomErr);
    } finally {
      cliOomSpy.mockRestore();
    }

    // 6b. Raw OOM in decodeHeic, decodeToSharpCompat, the DNG Sharp fallback probe, and SVG/non-SVG rasterizeToPng surfaces DecoderOutOfMemoryError (#3632)
    for (const makeRawOom of [
      () => new RangeError("Array buffer allocation failed"),
      () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
    ]) {
      const heicRawOomSpy = vi
        .spyOn(heicConverter, "decodeHeic")
        .mockRejectedValueOnce(makeRawOom());
      try {
        await expect(prepareRouteImage(HEIC, "photo.heic", "heif")).rejects.toBeInstanceOf(
          formatDecoders.DecoderOutOfMemoryError,
        );
      } finally {
        heicRawOomSpy.mockRestore();
      }

      const cliRawOomSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(makeRawOom());
      try {
        await expect(prepareRouteImage(validPng, "photo.dng", "raw")).rejects.toBeInstanceOf(
          formatDecoders.DecoderOutOfMemoryError,
        );
      } finally {
        cliRawOomSpy.mockRestore();
      }
    }

    for (const decodeFailure of [
      new formatDecoders.DecoderUnavailableError("No dcraw_emu found."),
      new Error("corrupt dng"),
    ]) {
      const dngCliSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(decodeFailure);
      const rawProbeOomSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
        this: sharp.Sharp,
      ) {
        return {
          toBuffer: async () => {
            throw new RangeError("Array buffer allocation failed");
          },
        } as unknown as sharp.Sharp;
      });
      try {
        await expect(prepareRouteImage(validPng, "photo.dng", "raw")).rejects.toBeInstanceOf(
          formatDecoders.DecoderOutOfMemoryError,
        );
      } finally {
        rawProbeOomSpy.mockRestore();
        dngCliSpy.mockRestore();
      }
    }

    const validSvgBuf = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>',
    );
    const apngMetaOomSpy = vi
      .spyOn(sharp.prototype, "metadata")
      .mockRejectedValueOnce(new RangeError("Array buffer allocation failed"));
    try {
      await expect(prepareRouteImage(validPng, "photo.apng", "png")).rejects.toBeInstanceOf(
        formatDecoders.DecoderOutOfMemoryError,
      );
    } finally {
      apngMetaOomSpy.mockRestore();
    }

    const pngOomSpy = vi
      .spyOn(sharp.prototype, "png")
      .mockImplementationOnce(function (this: sharp.Sharp) {
        return {
          toBuffer: async () => {
            throw new RangeError("Array buffer allocation failed");
          },
        } as unknown as sharp.Sharp;
      })
      .mockImplementationOnce(function (this: sharp.Sharp) {
        return {
          toBuffer: async () => {
            throw new RangeError("Array buffer allocation failed");
          },
        } as unknown as sharp.Sharp;
      });
    try {
      await expect(
        prepareRouteImage(validSvgBuf, "icon.svg", "svg", { rasterizeSvg: true }),
      ).rejects.toBeInstanceOf(formatDecoders.DecoderOutOfMemoryError);
      await expect(
        prepareRouteImage(validPng, "photo.png", "png", { rasterizeToPng: true }),
      ).rejects.toBeInstanceOf(formatDecoders.DecoderOutOfMemoryError);
    } finally {
      pngOomSpy.mockRestore();
    }

    // 7. Corrupt .heic client decode failure returns 422 without request.log.error
    const heicCorruptSpy = vi
      .spyOn(heicConverter, "decodeHeic")
      .mockRejectedValueOnce(new Error("heif-dec: invalid box"));
    try {
      mocks.getObjectBuffer.mockResolvedValueOnce(HEIC);
      const reqBadHeic = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.heic", file: {} },
      ]);
      const replyBadHeic = makeReply();
      await handlers["/api/v1/tools/image/remove-background"](reqBadHeic, replyBadHeic);
      expect(replyBadHeic.statusCode).toBe(422);
      expect(reqBadHeic.log.error).not.toHaveBeenCalled();
    } finally {
      heicCorruptSpy.mockRestore();
    }

    // 8. restore-photo AVIF fallback logs info, returns 422 without request.log.error on client AVIF decode failure, and rethrows DecoderUnavailableError
    const orientAvifSpy = vi
      .spyOn(autoOrientModule, "autoOrient")
      .mockResolvedValue(Buffer.from("corrupt-avif-payload"));
    const avifCliSpy = vi
      .spyOn(formatDecoders, "decodeAnyFormat")
      .mockRejectedValueOnce(new Error("magick avif decode failed"));
    try {
      mocks.getObjectBuffer.mockResolvedValueOnce(validAvif);
      const reqAvif = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.avif", file: {} },
      ]);
      const replyAvif = makeReply();
      await handlers["/api/v1/tools/image/restore-photo"](reqAvif, replyAvif);
      expect(replyAvif.statusCode).toBe(422);
      expect(reqAvif.log.info).toHaveBeenCalledTimes(1);
      expect(reqAvif.log.error).not.toHaveBeenCalled();
      expect((replyAvif.payload as { details: string }).details).toContain("native:");
      expect((replyAvif.payload as { details: string }).details).toContain(
        "magick avif decode failed",
      );
    } finally {
      avifCliSpy.mockRestore();
    }

    const avifUnavailSpy = vi
      .spyOn(formatDecoders, "decodeAnyFormat")
      .mockRejectedValueOnce(unavailableErr);
    try {
      mocks.getObjectBuffer.mockResolvedValueOnce(validAvif);
      const reqAvif503 = makeRequest([
        { type: "file", fieldname: "file", filename: "photo.avif", file: {} },
      ]);
      const replyAvif503 = makeReply();
      await expect(
        handlers["/api/v1/tools/image/restore-photo"](reqAvif503, replyAvif503),
      ).rejects.toBe(unavailableErr);
    } finally {
      avifUnavailSpy.mockRestore();
      orientAvifSpy.mockRestore();
    }
  });
});
