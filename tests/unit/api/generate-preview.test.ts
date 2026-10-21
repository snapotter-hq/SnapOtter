/**
 * generatePreview honesty (#746). When the processed result can't be decoded
 * for a preview, generatePreview must return no preview and log the failure. It
 * must never fabricate a "result preview" from a different buffer (the old code
 * fell back to the pre-processing input, which the client renders under the
 * processed filename, so a converted file showed the untouched original).
 *
 * Uses REAL sharp (the sibling postprocess.test.ts mocks it) so an undecodable
 * buffer actually throws and a valid one actually encodes.
 */

import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  schema: { jobs: {}, userFiles: {} },
}));

const putObjectMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  putObject: putObjectMock,
}));

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

const decodeHeicMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: decodeHeicMock,
}));

const reportEngineUnavailableMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/engine-unavailable.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/engine-unavailable.js")>();
  return {
    ...actual,
    reportEngineUnavailable: reportEngineUnavailableMock,
  };
});

import { generatePreview } from "../../../apps/api/src/jobs/postprocess.js";
import * as formatDecoders from "../../../apps/api/src/lib/format-decoders.js";
import { DecoderUnavailableError } from "../../../apps/api/src/lib/format-decoders.js";
import * as formatEncoders from "../../../apps/api/src/lib/format-encoders.js";
import { encodeQoi } from "../../../apps/api/src/lib/format-encoders.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerSvgToRaster } from "../../../apps/api/src/routes/tools/svg-to-raster.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

const JOB_ID = "job-preview-test";

beforeEach(() => {
  putObjectMock.mockReset();
  loggerMock.warn.mockReset();
  decodeHeicMock.mockReset();
  reportEngineUnavailableMock.mockReset();
});

describe("generatePreview honesty (#746)", () => {
  it("previews the actual result for a non-browser-previewable format", async () => {
    const tiffResult = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .tiff()
      .toBuffer();

    const key = await generatePreview(tiffResult, "image/tiff", JOB_ID);

    expect(key).toBe(`outputs/${JOB_ID}/preview.webp`);
    expect(putObjectMock).toHaveBeenCalledOnce();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("returns no preview and logs when the result can't be decoded, never fabricating one from the input", async () => {
    const undecodableResult = Buffer.from("this is not a decodable image at all");
    const decodableInput: Buffer = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();

    // The 4th arg is the pre-processing input the old code fell back to. It is no
    // longer a parameter (#746); passing it anyway proves the result preview is
    // never fabricated from it.
    // @ts-expect-error generatePreview no longer accepts a fallback input buffer.
    const key = await generatePreview(undecodableResult, "image/tiff", JOB_ID, decodableInput);

    expect(key).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledOnce();
  });

  it("reports a missing HEIF decoder through reportEngineUnavailable and stays non-fatal (#1453)", async () => {
    decodeHeicMock.mockRejectedValueOnce(new DecoderUnavailableError("No HEIF decoder found."));

    const key = await generatePreview(Buffer.from("heic-bytes"), "image/heic", JOB_ID, "convert");

    expect(key).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
    expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      message: "No HEIF decoder found.",
    });
    expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("convert");
    expect(loggerMock.warn).not.toHaveBeenCalled();

    reportEngineUnavailableMock.mockReset();
    decodeHeicMock.mockRejectedValueOnce(new DecoderUnavailableError("No HEIF decoder found."));
    await generatePreview(Buffer.from("heic-bytes"), "image/heif", JOB_ID);
    expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("output-preview");
  });

  it.each(["image/qoi", "image/x-qoi"])(
    "decodes CLI-encoded %s output via decodeToSharpCompat before encoding preview.webp (#2704)",
    async (contentType) => {
      const pngBuffer = await sharp({
        create: { width: 8, height: 8, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
      })
        .png()
        .toBuffer();
      const qoiBuffer = await encodeQoi(pngBuffer);

      const key = await generatePreview(qoiBuffer, contentType, JOB_ID, "convert");

      expect(key).toBe(`outputs/${JOB_ID}/preview.webp`);
      expect(putObjectMock).toHaveBeenCalledOnce();
      const [, previewBytes] = putObjectMock.mock.calls[0] as [string, Buffer];
      const meta = await sharp(previewBytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(8);
      expect(meta.height).toBe(8);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    },
  );

  it("reports a missing CLI decoder through reportEngineUnavailable and stays non-fatal (#2704)", async () => {
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No ImageMagick found."));
    try {
      const key = await generatePreview(
        Buffer.from("psd-bytes"),
        "image/vnd.adobe.photoshop",
        JOB_ID,
        "convert",
      );

      expect(key).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        message: "No ImageMagick found.",
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("convert");
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      decodeSpy.mockRestore();
    }
  });

  it.each([
    "application/epub+zip",
    "text/html",
    "text/markdown",
    "text/plain",
    "text/csv",
    "application/json",
    "application/xml",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/x-subrip",
    "application/octet-stream",
  ])(
    "returns undefined without invoking Sharp or logging a warning for non-image %s output (#2664)",
    async (contentType) => {
      const key = await generatePreview(
        Buffer.from("non-image output payload"),
        contentType,
        JOB_ID,
      );

      expect(key).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).not.toHaveBeenCalled();
    },
  );
});

describe("registerEditMetadata CLI-decoded preview generation (#2704)", () => {
  type EditHandler = (req: unknown, reply: unknown) => Promise<unknown>;

  function getEditMetadataHandler(): EditHandler {
    const routes = new Map<string, EditHandler>();
    const fakeApp = {
      post: (path: string, handler: EditHandler) => {
        routes.set(path, handler);
      },
    } as unknown as FastifyInstance;
    registerEditMetadata(fakeApp);
    const handler = routes.get("/api/v1/tools/image/edit-metadata");
    if (!handler) throw new Error("edit-metadata route not registered");
    return handler;
  }

  function makeMultipartRequest(fileBuffer: Buffer, filename: string, settings = "{}") {
    return {
      log: loggerMock,
      parts: async function* () {
        yield {
          type: "file",
          fieldname: "file",
          filename,
          file: (async function* () {
            yield fileBuffer;
          })(),
        };
        yield {
          type: "field",
          fieldname: "settings",
          value: settings,
        };
      },
    };
  }

  function makeReply() {
    let statusCode = 200;
    let payload: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return reply;
      },
      send(body: unknown) {
        payload = body;
        return reply;
      },
      get statusCode() {
        return statusCode;
      },
      get payload() {
        return payload;
      },
    };
    return reply;
  }

  it("decodes a QOI file via decodeToSharpCompat and writes preview.webp (#2704)", async () => {
    const handler = getEditMetadataHandler();
    const pngBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const qoiBuffer = await encodeQoi(pngBuffer);
    const reply = makeReply();

    await handler(makeMultipartRequest(qoiBuffer, "sample.qoi"), reply);

    expect(reply.statusCode).toBe(200);
    const body = reply.payload as { jobId: string; previewUrl?: string };
    expect(body.previewUrl).toBe(`/api/v1/download/${body.jobId}/preview.webp`);
    expect(putObjectMock).toHaveBeenCalledTimes(2);
    const [previewKey, previewBytes] = putObjectMock.mock.calls[1] as [string, Buffer];
    expect(previewKey).toBe(`outputs/${body.jobId}/preview.webp`);
    const meta = await sharp(previewBytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
  });

  it("reports a missing CLI decoder through reportEngineUnavailable and keeps the 200 response (#2704)", async () => {
    const handler = getEditMetadataHandler();
    const pngBuffer = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const qoiBuffer = await encodeQoi(pngBuffer);
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No ImageMagick found."));
    const reply = makeReply();

    try {
      await handler(makeMultipartRequest(qoiBuffer, "sample.qoi"), reply);

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as { jobId: string; previewUrl?: string };
      expect(body.previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
    } finally {
      decodeSpy.mockRestore();
    }
  });

  it("logs a warning without calling reportEngineUnavailable when decodeToSharpCompat fails with a non-503 error (#2704)", async () => {
    const handler = getEditMetadataHandler();
    const pngBuffer = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const qoiBuffer = await encodeQoi(pngBuffer);
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new Error("corrupt qoi"));
    const reply = makeReply();

    try {
      await handler(makeMultipartRequest(qoiBuffer, "sample.qoi"), reply);

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as { jobId: string; previewUrl?: string };
      expect(body.previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledOnce();
      expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
        "preview generation failed; result has no renderable preview",
      );
    } finally {
      decodeSpy.mockRestore();
    }
  });

  it("forwards the RAW extension to decodeToSharpCompat and falls back to Sharp on TIFF-headed DNG when the CLI decoder is missing (#2704)", async () => {
    const handler = getEditMetadataHandler();
    const tiffBuffer = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .tiff()
      .toBuffer();
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
    const reply = makeReply();

    try {
      await handler(makeMultipartRequest(tiffBuffer, "photo.dng"), reply);

      expect(decodeSpy).toHaveBeenCalledWith(tiffBuffer, "raw", "dng");
      expect(reply.statusCode).toBe(200);
      const body = reply.payload as { jobId: string; previewUrl?: string };
      expect(body.previewUrl).toBe(`/api/v1/download/${body.jobId}/preview.webp`);
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      decodeSpy.mockRestore();
    }
  });
});

describe("registerSvgToRaster JXL preview generation (#3179)", () => {
  type SvgHandler = (req: unknown, reply: unknown) => Promise<unknown>;

  function getSvgToRasterHandler(): SvgHandler {
    const routes = new Map<string, SvgHandler>();
    const fakeApp = {
      post: (path: string, handler: SvgHandler) => {
        routes.set(path, handler);
      },
    } as unknown as FastifyInstance;
    registerSvgToRaster(fakeApp);
    const handler = routes.get("/api/v1/tools/image/svg-to-raster");
    if (!handler) throw new Error("svg-to-raster route not registered");
    return handler;
  }

  function makeSvgRequest(svgBuffer: Buffer, filename: string, settings: string) {
    return {
      log: loggerMock,
      parts: async function* () {
        yield {
          type: "file",
          fieldname: "file",
          filename,
          file: (async function* () {
            yield svgBuffer;
          })(),
        };
        yield {
          type: "field",
          fieldname: "settings",
          value: settings,
        };
      },
    };
  }

  function makeReply() {
    let statusCode = 200;
    let payload: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return reply;
      },
      send(body: unknown) {
        payload = body;
        return reply;
      },
      get statusCode() {
        return statusCode;
      },
      get payload() {
        return payload;
      },
    };
    return reply;
  }

  const SVG_BUF = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#2266aa"/></svg>',
  );

  it("decodes a JXL output via decodeToSharpCompat and writes preview.webp (#3179)", async () => {
    const handler = getSvgToRasterHandler();
    const jxlFixture = readFixture(fixtures.image.formats("jxl"));
    const encodeSpy = vi.spyOn(formatEncoders, "encodeJxl").mockResolvedValueOnce(jxlFixture);
    const decodeSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat");
    const reply = makeReply();

    try {
      await handler(
        makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "jxl", dpi: 72 })),
        reply,
      );

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as { jobId: string; downloadUrl: string; previewUrl?: string };
      expect(body.downloadUrl).toBe(`/api/v1/download/${body.jobId}/icon.jxl`);
      expect(body.previewUrl).toBe(`/api/v1/download/${body.jobId}/preview.webp`);
      expect(decodeSpy).toHaveBeenCalledWith(jxlFixture, "jxl");
      expect(putObjectMock).toHaveBeenCalledTimes(2);
      const [previewKey, previewBytes] = putObjectMock.mock.calls[1] as [string, Buffer];
      expect(previewKey).toBe(`outputs/${body.jobId}/preview.webp`);
      const meta = await sharp(previewBytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBeLessThanOrEqual(1200);
      expect(meta.height).toBeLessThanOrEqual(1200);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      encodeSpy.mockRestore();
      decodeSpy.mockRestore();
    }
  });

  it("reports a missing JXL decoder through reportEngineUnavailable and keeps the 200 response (#3179)", async () => {
    const handler = getSvgToRasterHandler();
    const encodeSpy = vi
      .spyOn(formatEncoders, "encodeJxl")
      .mockResolvedValueOnce(Buffer.from("jxl-bytes"));
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No JXL decoder found."));
    const reply = makeReply();

    try {
      await handler(
        makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "jxl", dpi: 72 })),
        reply,
      );

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as { jobId: string; downloadUrl: string; previewUrl?: string };
      expect(body.downloadUrl).toBe(`/api/v1/download/${body.jobId}/icon.jxl`);
      expect(body.previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        message: "No JXL decoder found.",
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("svg-to-raster");
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      encodeSpy.mockRestore();
      decodeSpy.mockRestore();
    }
  });

  it("logs a warning without calling reportEngineUnavailable when decodeToSharpCompat fails with a non-503 error (#3179)", async () => {
    const handler = getSvgToRasterHandler();
    const encodeSpy = vi
      .spyOn(formatEncoders, "encodeJxl")
      .mockResolvedValueOnce(Buffer.from("jxl-bytes"));
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new Error("corrupt jxl"));
    const reply = makeReply();

    try {
      await handler(
        makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "jxl", dpi: 72 })),
        reply,
      );

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as { jobId: string; previewUrl?: string };
      expect(body.previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledOnce();
      expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
        "preview generation failed; result has no renderable preview",
      );
    } finally {
      encodeSpy.mockRestore();
      decodeSpy.mockRestore();
    }
  });
});
