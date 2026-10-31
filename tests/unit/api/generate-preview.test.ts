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

// The route's permission gate is covered by
// tests/integration/security/upload-preview-authorization.test.ts; these cases
// are about fetching and decoding, so every caller passes it.
vi.mock("../../../apps/api/src/permissions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/permissions.js")>()),
  requireFileAccess: async (request: { user?: unknown }) =>
    request.user ?? { id: "test-user", role: "user" },
}));
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    insert: () => ({ values: async () => {} }),
    delete: () => ({ where: async () => {} }),
  },
  schema: { jobs: { id: "jobs.id" }, userFiles: {} },
}));

const putObjectMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/object-storage.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/object-storage.js")>();
  return {
    ...actual,
    putObject: putObjectMock,
  };
});

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../../../apps/api/src/lib/logger.js", () => ({ logger: loggerMock }));

const decodeHeicMock = vi.hoisted(() => vi.fn());
const encodeHeicMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: decodeHeicMock,
  encodeHeic: encodeHeicMock,
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

import { CAMERA_RAW_INPUTS, IMAGE_EXT_TO_MIME, IMAGE_MIME_TO_EXT } from "@snapotter/shared";
import { buildOutputName, generatePreview } from "../../../apps/api/src/jobs/postprocess.js";
import * as formatDecoders from "../../../apps/api/src/lib/format-decoders.js";
import {
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
} from "../../../apps/api/src/lib/format-decoders.js";
import * as formatEncoders from "../../../apps/api/src/lib/format-encoders.js";
import { encodeQoi } from "../../../apps/api/src/lib/format-encoders.js";
import { normalizeOperationalWriteError } from "../../../apps/api/src/lib/object-storage.js";
import { registerFetchUrlsRoute } from "../../../apps/api/src/routes/fetch-urls.js";
import { getToolConfig } from "../../../apps/api/src/routes/tool-factory.js";
import { registerEditMetadata } from "../../../apps/api/src/routes/tools/edit-metadata.js";
import { registerSvgToRaster } from "../../../apps/api/src/routes/tools/svg-to-raster.js";
import { fixtures, readFixture } from "../../fixtures/index.js";

function writeErrnoError(code: string, syscall = "open"): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: temp write failed, ${syscall} '/tmp/in-${code}'`), {
    code,
    syscall,
  });
}

const WRITE_FAULT_CASES: ReadonlyArray<readonly [string, "storage-full" | "storage-not-writable"]> =
  [
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ];

const JOB_ID = "job-preview-test";

beforeEach(() => {
  putObjectMock.mockReset();
  loggerMock.warn.mockReset();
  decodeHeicMock.mockReset();
  encodeHeicMock.mockReset();
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

  it("decodes application/postscript EPS output from convert via decodeToSharpCompat before encoding preview.webp (#3183)", async () => {
    const epsBuffer = readFixture(fixtures.image.formats("eps"));
    const decodedPng = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 30, g: 60, b: 90 } },
    })
      .png()
      .toBuffer();
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockResolvedValueOnce(decodedPng);

    try {
      const key = await generatePreview(epsBuffer, "application/postscript", JOB_ID, "convert");

      expect(decodeSpy).toHaveBeenCalledWith(epsBuffer, "eps");
      expect(key).toBe(`outputs/${JOB_ID}/preview.webp`);
      expect(putObjectMock).toHaveBeenCalledOnce();
      const [, previewBytes] = putObjectMock.mock.calls[0] as [string, Buffer];
      const meta = await sharp(previewBytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(12);
      expect(meta.height).toBe(12);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      decodeSpy.mockRestore();
    }
  });

  it("decodes every camera RAW MIME type in IMAGE_EXT_TO_MIME (plus image/x-dcraw) via decodeToSharpCompat('raw', ext) before encoding preview.webp (#3224)", async () => {
    const decodedPng = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 30, g: 60, b: 90 } },
    })
      .png()
      .toBuffer();
    const decodeSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockResolvedValue(decodedPng);

    try {
      for (const dotExt of CAMERA_RAW_INPUTS) {
        const ext = dotExt.slice(1);
        const contentType = IMAGE_EXT_TO_MIME[ext];
        expect(contentType, `missing IMAGE_EXT_TO_MIME for .${ext}`).toBeDefined();
        if (!contentType) continue;
        expect(IMAGE_MIME_TO_EXT[contentType]).toBe(ext);

        putObjectMock.mockReset();
        decodeSpy.mockClear();
        const rawBuf = Buffer.from(`raw-${ext}-payload`);
        const key = await generatePreview(rawBuf, contentType, JOB_ID, "edit-metadata");

        expect(decodeSpy).toHaveBeenCalledWith(rawBuf, "raw", ext);
        expect(key).toBe(`outputs/${JOB_ID}/preview.webp`);
        expect(putObjectMock).toHaveBeenCalledOnce();
        const [, previewBytes] = putObjectMock.mock.calls[0] as [string, Buffer];
        const meta = await sharp(previewBytes).metadata();
        expect(meta.format).toBe("webp");
        expect(meta.width).toBe(12);
        expect(meta.height).toBe(12);
      }

      putObjectMock.mockReset();
      decodeSpy.mockClear();
      const dcrawBuf = Buffer.from("raw-dcraw-payload");
      const dcrawKey = await generatePreview(dcrawBuf, "image/x-dcraw", JOB_ID, "edit-metadata");
      expect(decodeSpy).toHaveBeenCalledWith(dcrawBuf, "raw", undefined);
      expect(dcrawKey).toBe(`outputs/${JOB_ID}/preview.webp`);
      expect(putObjectMock).toHaveBeenCalledOnce();
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      decodeSpy.mockRestore();
    }
  });

  it("falls back to Sharp on TIFF-headed DNG in generatePreview when decodeToSharpCompat throws DecoderUnavailableError, and still reports ENGINE_UNAVAILABLE on CR2 or OOM/503 write faults (#3224)", async () => {
    const tiffHeadedDng = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .tiff()
      .toBuffer();
    const cr2Buffer = readFixture(fixtures.image.formats("cr2"));

    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
    try {
      const key = await generatePreview(
        tiffHeadedDng,
        "image/x-adobe-dng",
        JOB_ID,
        "edit-metadata",
      );
      expect(decodeSpy).toHaveBeenCalledWith(tiffHeadedDng, "raw", "dng");
      expect(key).toBe(`outputs/${JOB_ID}/preview.webp`);
      expect(putObjectMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      decodeSpy.mockRestore();
    }

    putObjectMock.mockReset();
    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    const cr2Spy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
    try {
      const cr2Key = await generatePreview(cr2Buffer, "image/x-canon-cr2", JOB_ID, "edit-metadata");
      expect(cr2Spy).toHaveBeenCalledOnce();
      expect(cr2Spy.mock.calls[0]?.[0]).toBe(cr2Buffer);
      expect(cr2Spy.mock.calls[0]?.slice(1)).toEqual(["raw", "cr2"]);
      expect(cr2Key).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      cr2Spy.mockRestore();
    }

    putObjectMock.mockReset();
    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    const corruptErr = new Error("corrupt cr2");
    const corruptCr2Spy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(corruptErr);
    try {
      const corruptKey = await generatePreview(
        Buffer.from("not-a-valid-raw-or-tiff"),
        "image/x-canon-cr2",
        JOB_ID,
        "edit-metadata",
      );
      expect(corruptKey).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledOnce();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: corruptErr, jobId: JOB_ID, contentType: "image/x-canon-cr2" },
        "preview generation failed; result has no renderable preview",
      );
    } finally {
      corruptCr2Spy.mockRestore();
    }

    putObjectMock.mockReset();
    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    const oomSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderOutOfMemoryError("raw", new Error("SIGKILL")))
      .mockRejectedValueOnce(
        Object.assign(new Error("dcraw_emu exited SIGKILL"), { signal: "SIGKILL" }),
      );
    try {
      for (let i = 0; i < 2; i++) {
        reportEngineUnavailableMock.mockReset();
        const oomKey = await generatePreview(
          tiffHeadedDng,
          "image/x-adobe-dng",
          JOB_ID,
          "edit-metadata",
        );
        expect(oomKey).toBeUndefined();
        expect(putObjectMock).not.toHaveBeenCalled();
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
        });
        expect(loggerMock.warn).not.toHaveBeenCalled();
      }
    } finally {
      oomSpy.mockRestore();
    }

    putObjectMock.mockReset();
    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    const enospcSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(writeErrnoError("ENOSPC"));
    try {
      const enospcKey = await generatePreview(
        tiffHeadedDng,
        "image/x-adobe-dng",
        JOB_ID,
        "edit-metadata",
      );
      expect(enospcKey).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "storage-full",
      });
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      enospcSpy.mockRestore();
    }

    putObjectMock.mockReset();
    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    const webpSpy = vi
      .spyOn(sharp.prototype, "webp")
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
            throw new RangeError("Invalid WebP parameter");
          },
        } as unknown as sharp.Sharp;
      });
    try {
      const webpOomKey = await generatePreview(tiffHeadedDng, "image/tiff", JOB_ID, "convert");
      expect(webpOomKey).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("convert");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      reportEngineUnavailableMock.mockReset();
      const nonOomRangeKey = await generatePreview(tiffHeadedDng, "image/tiff", JOB_ID, "convert");
      expect(nonOomRangeKey).toBeUndefined();
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledOnce();
    } finally {
      webpSpy.mockRestore();
    }

    putObjectMock.mockReset();
    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    const dngUnavailableSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No dcraw_emu found."));
    const rawProbeSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw new RangeError("Array buffer allocation failed");
        },
      } as unknown as sharp.Sharp;
    });
    try {
      const dngProbeOomKey = await generatePreview(
        tiffHeadedDng,
        "image/x-adobe-dng",
        JOB_ID,
        "edit-metadata",
      );
      expect(dngProbeOomKey).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      rawProbeSpy.mockRestore();
      dngUnavailableSpy.mockRestore();
    }
  });

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

  it.each(WRITE_FAULT_CASES)(
    "reports 503 %s (%s) from decodeHeic and decodeToSharpCompat through reportEngineUnavailable and stays non-fatal (#3452)",
    async (errnoCode, expectedCode) => {
      const normalizedHeicFault = normalizeOperationalWriteError(writeErrnoError(errnoCode));
      decodeHeicMock.mockRejectedValueOnce(normalizedHeicFault);

      const heicKey = await generatePreview(
        Buffer.from("heic-bytes"),
        "image/heic",
        JOB_ID,
        "convert",
      );
      expect(heicKey).toBeUndefined();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: expectedCode,
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("convert");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      reportEngineUnavailableMock.mockReset();
      decodeHeicMock.mockRejectedValueOnce(writeErrnoError(errnoCode));
      const rawHeicKey = await generatePreview(Buffer.from("heic-bytes"), "image/heif", JOB_ID);
      expect(rawHeicKey).toBeUndefined();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: expectedCode,
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("output-preview");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      reportEngineUnavailableMock.mockReset();
      const tiffHeadedDng = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 40, g: 80, b: 120 } },
      })
        .tiff()
        .toBuffer();
      const decodeSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(normalizeOperationalWriteError(writeErrnoError(errnoCode)))
        .mockRejectedValueOnce(writeErrnoError(errnoCode))
        .mockRejectedValueOnce(normalizeOperationalWriteError(writeErrnoError(errnoCode)))
        .mockRejectedValueOnce(writeErrnoError(errnoCode));
      try {
        const psdKey = await generatePreview(
          Buffer.from("psd-bytes"),
          "image/vnd.adobe.photoshop",
          JOB_ID,
          "convert",
        );
        expect(psdKey).toBeUndefined();
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("convert");
        expect(loggerMock.warn).not.toHaveBeenCalled();

        reportEngineUnavailableMock.mockReset();
        const qoiKey = await generatePreview(
          Buffer.from("qoi-bytes"),
          "image/qoi",
          JOB_ID,
          "convert",
        );
        expect(qoiKey).toBeUndefined();
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("convert");
        expect(loggerMock.warn).not.toHaveBeenCalled();

        for (let i = 0; i < 2; i++) {
          reportEngineUnavailableMock.mockReset();
          const dngKey = await generatePreview(
            tiffHeadedDng,
            "image/x-adobe-dng",
            JOB_ID,
            "edit-metadata",
          );
          expect(dngKey).toBeUndefined();
          expect(putObjectMock).not.toHaveBeenCalled();
          expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
          expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
            statusCode: 503,
            code: expectedCode,
          });
          expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
          expect(loggerMock.warn).not.toHaveBeenCalled();
        }
      } finally {
        decodeSpy.mockRestore();
      }
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

  it("reports engine unavailable when decodeToSharpCompat throws DecoderUnavailableError on a TIFF-headed RAW (CR2) whose header Sharp reads (#2801)", async () => {
    const handler = getEditMetadataHandler();
    const cr2Buffer = readFixture(fixtures.image.formats("cr2"));
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
    const reply = makeReply();

    try {
      await handler(makeMultipartRequest(cr2Buffer, "photo.cr2"), reply);

      expect(reply.statusCode).toBe(200);
      const body = reply.payload as { jobId: string; previewUrl?: string };
      expect(body.previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      decodeSpy.mockRestore();
    }
  });

  it("maps Radiance HDR inputs to image/vnd.radiance and generates preview.webp (#3180)", async () => {
    const handler = getEditMetadataHandler();
    const hdrBuffer = readFixture(fixtures.image.formats("hdr"));
    const decodedPng = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .png()
      .toBuffer();
    const decodeSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockResolvedValueOnce(decodedPng);
    const reply = makeReply();

    try {
      await handler(makeMultipartRequest(hdrBuffer, "sample.hdr"), reply);

      expect(reply.statusCode).toBe(200);
      expect(decodeSpy).toHaveBeenCalledWith(hdrBuffer, "hdr", "hdr");
      const body = reply.payload as { jobId: string; previewUrl?: string };
      expect(body.previewUrl).toBe(`/api/v1/download/${body.jobId}/preview.webp`);
      expect(putObjectMock).toHaveBeenCalledTimes(2);
      const [previewKey, previewBytes] = putObjectMock.mock.calls[1] as [string, Buffer];
      expect(previewKey).toBe(`outputs/${body.jobId}/preview.webp`);
      const meta = await sharp(previewBytes).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(10);
      expect(meta.height).toBe(10);
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      decodeSpy.mockRestore();
    }
  });

  it("returns IMAGE_EXT_TO_MIME content types from the registered process function so batch and pipeline runs preserve extensions and generate previews (#3180)", async () => {
    getEditMetadataHandler();
    const config = getToolConfig("edit-metadata");
    if (!config) throw new Error("edit-metadata process config not registered");

    for (const [ext, expectedMime] of Object.entries(IMAGE_EXT_TO_MIME)) {
      const result = await config.process(Buffer.from("bytes"), {}, `Photo.${ext.toUpperCase()}`);
      expect(result.contentType, `extension .${ext}`).toBe(expectedMime);
    }

    for (const [ext, expectedMime] of [
      ["psd", "image/vnd.adobe.photoshop"],
      ["bmp", "image/bmp"],
      ["jxl", "image/jxl"],
      ["jp2", "image/jp2"],
      ["qoi", "image/qoi"],
      ["tga", "image/x-tga"],
      ["ico", "image/x-icon"],
      ["ppm", "image/x-portable-pixmap"],
      ["hdr", "image/vnd.radiance"],
    ] as const) {
      const result = await config.process(Buffer.from("bytes"), {}, `sample.${ext}`);
      expect(result.contentType).toBe(expectedMime);
      expect(
        buildOutputName(result.filename, `sample.${ext}`, "edit-metadata", result.contentType),
      ).toBe(`sample_edit-metadata.${ext}`);
    }

    const fallback = await config.process(Buffer.from("bytes"), {}, "sample.unknown");
    expect(fallback.contentType).toBe("image/jpeg");
  });

  it.each(WRITE_FAULT_CASES)(
    "reports 503 %s (%s) from decodeHeic and decodeToSharpCompat (including TIFF-headed DNG) through reportEngineUnavailable and keeps the 200 response (#3452)",
    async (errnoCode, expectedCode) => {
      const handler = getEditMetadataHandler();
      const heicBuffer = readFixture(fixtures.image.base.heic200);
      const pngBuffer = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const qoiBuffer = await encodeQoi(pngBuffer);
      const tiffHeadedDng = await sharp({
        create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
      })
        .tiff()
        .toBuffer();

      for (const makeFault of [
        () => normalizeOperationalWriteError(writeErrnoError(errnoCode)),
        () => writeErrnoError(errnoCode),
      ]) {
        reportEngineUnavailableMock.mockReset();
        loggerMock.warn.mockReset();
        putObjectMock.mockReset();
        decodeHeicMock.mockRejectedValueOnce(makeFault());
        const heicReply = makeReply();
        await handler(makeMultipartRequest(heicBuffer, "photo.heic"), heicReply);
        expect(heicReply.statusCode).toBe(200);
        expect((heicReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
        expect(loggerMock.warn).not.toHaveBeenCalled();

        reportEngineUnavailableMock.mockReset();
        loggerMock.warn.mockReset();
        putObjectMock.mockReset();
        const qoiDecodeSpy = vi
          .spyOn(formatDecoders, "decodeToSharpCompat")
          .mockRejectedValueOnce(makeFault());
        try {
          const qoiReply = makeReply();
          await handler(makeMultipartRequest(qoiBuffer, "sample.qoi"), qoiReply);
          expect(qoiReply.statusCode).toBe(200);
          expect((qoiReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
          expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
          expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
            statusCode: 503,
            code: expectedCode,
          });
          expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
          expect(loggerMock.warn).not.toHaveBeenCalled();
        } finally {
          qoiDecodeSpy.mockRestore();
        }

        reportEngineUnavailableMock.mockReset();
        loggerMock.warn.mockReset();
        putObjectMock.mockReset();
        const dngDecodeSpy = vi
          .spyOn(formatDecoders, "decodeToSharpCompat")
          .mockRejectedValueOnce(makeFault());
        try {
          const dngReply = makeReply();
          await handler(makeMultipartRequest(tiffHeadedDng, "photo.dng"), dngReply);
          expect(dngReply.statusCode).toBe(200);
          expect((dngReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
          expect(putObjectMock).toHaveBeenCalledTimes(1);
          expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
          expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
            statusCode: 503,
            code: expectedCode,
          });
          expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
          expect(loggerMock.warn).not.toHaveBeenCalled();
        } finally {
          dngDecodeSpy.mockRestore();
        }
      }
    },
  );

  it("does not fall back to Sharp on a TIFF-headed DNG when decodeToSharpCompat throws DecoderOutOfMemoryError, and keeps putObject 503 preview write faults out of reportEngineUnavailable (#3452)", async () => {
    const handler = getEditMetadataHandler();
    const heicBuffer = readFixture(fixtures.image.base.heic200);
    const tiffHeadedDng = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .tiff()
      .toBuffer();

    const dngOomSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderOutOfMemoryError("raw", new Error("SIGKILL")));
    try {
      const dngReply = makeReply();
      await handler(makeMultipartRequest(tiffHeadedDng, "photo.dng"), dngReply);
      expect(dngReply.statusCode).toBe(200);
      expect((dngReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
      });
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      dngOomSpy.mockRestore();
    }

    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    putObjectMock.mockReset();
    decodeHeicMock.mockRejectedValueOnce(new Error("corrupt heic"));
    const corruptReply = makeReply();
    await handler(makeMultipartRequest(heicBuffer, "photo.heic"), corruptReply);
    expect(corruptReply.statusCode).toBe(200);
    expect((corruptReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
    expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
      "preview generation failed; result has no renderable preview",
    );

    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    putObjectMock.mockReset();
    decodeHeicMock.mockResolvedValueOnce(tiffHeadedDng);
    putObjectMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error("storage write failed"), { statusCode: 503 }));
    const putErrReply = makeReply();
    await handler(makeMultipartRequest(heicBuffer, "photo.heic"), putErrReply);
    expect(putErrReply.statusCode).toBe(200);
    expect((putErrReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
    expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
      "preview generation failed; result has no renderable preview",
    );
  });

  it("routes preview WebP V8 buffer allocation OOM and raw decode SIGKILL/OOM through reportEngineUnavailable (#3383)", async () => {
    const handler = getEditMetadataHandler();
    const heicBuffer = readFixture(fixtures.image.base.heic200);
    const pngBuffer = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const qoiBuffer = await encodeQoi(pngBuffer);
    const tiffBuffer = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .tiff()
      .toBuffer();

    // 1. Inline preview sharp(previewInput).webp({ quality: 80 }).toBuffer() rejects with V8 RangeError
    const webpSpy = vi
      .spyOn(sharp.prototype, "webp")
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
            throw new RangeError("Invalid WebP parameter");
          },
        } as unknown as sharp.Sharp;
      });
    try {
      const tiffReply = makeReply();
      await handler(makeMultipartRequest(tiffBuffer, "photo.tiff"), tiffReply);
      expect(tiffReply.statusCode).toBe(200);
      expect((tiffReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      putObjectMock.mockReset();
      const nonOomReply = makeReply();
      await handler(makeMultipartRequest(tiffBuffer, "photo.tiff"), nonOomReply);
      expect(nonOomReply.statusCode).toBe(200);
      expect((nonOomReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledOnce();
    } finally {
      webpSpy.mockRestore();
    }

    // 1b. DNG Sharp fallback probe throwing V8 RangeError preserves DecoderOutOfMemoryError over DecoderUnavailableError
    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    putObjectMock.mockReset();
    const dngUnavailableSpy = vi
      .spyOn(formatDecoders, "decodeToSharpCompat")
      .mockRejectedValueOnce(new DecoderUnavailableError("No dcraw_emu found."));
    const rawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
      this: sharp.Sharp,
    ) {
      return {
        toBuffer: async () => {
          throw new RangeError("Array buffer allocation failed");
        },
      } as unknown as sharp.Sharp;
    });
    try {
      const dngProbeOomReply = makeReply();
      await handler(makeMultipartRequest(tiffBuffer, "photo.dng"), dngProbeOomReply);
      expect(dngProbeOomReply.statusCode).toBe(200);
      expect((dngProbeOomReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
      });
      expect(loggerMock.warn).not.toHaveBeenCalled();
    } finally {
      rawSpy.mockRestore();
      dngUnavailableSpy.mockRestore();
    }

    // 2. Raw SIGKILL and V8 RangeError at decodeHeic / decodeToSharpCompat (including TIFF-headed DNG)
    for (const makeRawOom of [
      () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
      () => new RangeError("Array buffer allocation failed"),
    ]) {
      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      putObjectMock.mockReset();
      decodeHeicMock.mockRejectedValueOnce(makeRawOom());
      const heicReply = makeReply();
      await handler(makeMultipartRequest(heicBuffer, "photo.heic"), heicReply);
      expect(heicReply.statusCode).toBe(200);
      expect((heicReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      putObjectMock.mockReset();
      const qoiDecodeSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(makeRawOom());
      try {
        const qoiReply = makeReply();
        await handler(makeMultipartRequest(qoiBuffer, "sample.qoi"), qoiReply);
        expect(qoiReply.statusCode).toBe(200);
        expect((qoiReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        qoiDecodeSpy.mockRestore();
      }

      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      putObjectMock.mockReset();
      const dngDecodeSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(makeRawOom());
      try {
        const dngReply = makeReply();
        await handler(makeMultipartRequest(tiffBuffer, "photo.dng"), dngReply);
        expect(dngReply.statusCode).toBe(200);
        expect((dngReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
        expect(putObjectMock).toHaveBeenCalledTimes(1);
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("edit-metadata");
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        dngDecodeSpy.mockRestore();
      }
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

  it.each(WRITE_FAULT_CASES)(
    "reports 503 %s (%s) from decodeHeic (heif) and decodeToSharpCompat (jxl) through reportEngineUnavailable and keeps the 200 response (#3452)",
    async (errnoCode, expectedCode) => {
      const handler = getSvgToRasterHandler();
      encodeHeicMock.mockResolvedValue(Buffer.from("heic-bytes"));

      for (const makeFault of [
        () => normalizeOperationalWriteError(writeErrnoError(errnoCode)),
        () => writeErrnoError(errnoCode),
      ]) {
        reportEngineUnavailableMock.mockReset();
        loggerMock.warn.mockReset();
        decodeHeicMock.mockRejectedValueOnce(makeFault());
        const heifReply = makeReply();
        await handler(
          makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "heif", dpi: 72 })),
          heifReply,
        );
        expect(heifReply.statusCode).toBe(200);
        expect((heifReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: expectedCode,
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("svg-to-raster");
        expect(loggerMock.warn).not.toHaveBeenCalled();

        reportEngineUnavailableMock.mockReset();
        loggerMock.warn.mockReset();
        const encodeJxlSpy = vi
          .spyOn(formatEncoders, "encodeJxl")
          .mockResolvedValueOnce(Buffer.from("jxl-bytes"));
        const decodeSpy = vi
          .spyOn(formatDecoders, "decodeToSharpCompat")
          .mockRejectedValueOnce(makeFault());
        try {
          const jxlReply = makeReply();
          await handler(
            makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "jxl", dpi: 72 })),
            jxlReply,
          );
          expect(jxlReply.statusCode).toBe(200);
          expect((jxlReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
          expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
          expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
            statusCode: 503,
            code: expectedCode,
          });
          expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("svg-to-raster");
          expect(loggerMock.warn).not.toHaveBeenCalled();
        } finally {
          encodeJxlSpy.mockRestore();
          decodeSpy.mockRestore();
        }
      }
    },
  );

  it("logs a warning without calling reportEngineUnavailable on non-503 decodeHeic errors or 503 preview.webp putObject errors (#3452)", async () => {
    const handler = getSvgToRasterHandler();
    encodeHeicMock.mockResolvedValue(Buffer.from("heic-bytes"));
    decodeHeicMock.mockRejectedValueOnce(new Error("corrupt heif"));

    const corruptReply = makeReply();
    await handler(
      makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "heif", dpi: 72 })),
      corruptReply,
    );
    expect(corruptReply.statusCode).toBe(200);
    expect((corruptReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
    expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
      "preview generation failed; result has no renderable preview",
    );

    reportEngineUnavailableMock.mockReset();
    loggerMock.warn.mockReset();
    putObjectMock.mockReset();
    const decodedPng = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 20, g: 40, b: 60 } },
    })
      .png()
      .toBuffer();
    decodeHeicMock.mockResolvedValueOnce(decodedPng);
    putObjectMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error("storage write failed"), { statusCode: 503 }));

    const putErrReply = makeReply();
    await handler(
      makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "heif", dpi: 72 })),
      putErrReply,
    );
    expect(putErrReply.statusCode).toBe(200);
    expect((putErrReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
    expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
      "preview generation failed; result has no renderable preview",
    );
  });

  it("routes preview WebP V8 buffer allocation OOM and raw decode SIGKILL/OOM through reportEngineUnavailable (#3383)", async () => {
    const handler = getSvgToRasterHandler();
    encodeHeicMock.mockResolvedValue(Buffer.from("heic-bytes"));

    // 1. Inline preview sharp(previewInput).resize(...).webp({ quality: 80 }).toBuffer() rejects with V8 RangeError
    const webpSpy = vi
      .spyOn(sharp.prototype, "webp")
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
            throw new RangeError("Invalid WebP parameter");
          },
        } as unknown as sharp.Sharp;
      });
    try {
      const tiffReply = makeReply();
      await handler(
        makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "tiff", dpi: 72 })),
        tiffReply,
      );
      expect(tiffReply.statusCode).toBe(200);
      expect((tiffReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(putObjectMock).toHaveBeenCalledTimes(1);
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("svg-to-raster");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      putObjectMock.mockReset();
      const nonOomReply = makeReply();
      await handler(
        makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "tiff", dpi: 72 })),
        nonOomReply,
      );
      expect(nonOomReply.statusCode).toBe(200);
      expect((nonOomReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledOnce();
    } finally {
      webpSpy.mockRestore();
    }

    // 2. Raw SIGKILL and V8 RangeError at decodeHeic (heif) / decodeToSharpCompat (jxl)
    for (const makeRawOom of [
      () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
      () => new RangeError("Array buffer allocation failed"),
    ]) {
      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      decodeHeicMock.mockRejectedValueOnce(makeRawOom());
      const heifReply = makeReply();
      await handler(
        makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "heif", dpi: 72 })),
        heifReply,
      );
      expect(heifReply.statusCode).toBe(200);
      expect((heifReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
      expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
      expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
      });
      expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("svg-to-raster");
      expect(loggerMock.warn).not.toHaveBeenCalled();

      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      const encodeJxlSpy = vi
        .spyOn(formatEncoders, "encodeJxl")
        .mockResolvedValueOnce(Buffer.from("jxl-bytes"));
      const decodeSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(makeRawOom());
      try {
        const jxlReply = makeReply();
        await handler(
          makeSvgRequest(SVG_BUF, "icon.svg", JSON.stringify({ outputFormat: "jxl", dpi: 72 })),
          jxlReply,
        );
        expect(jxlReply.statusCode).toBe(200);
        expect((jxlReply.payload as { previewUrl?: string }).previewUrl).toBeUndefined();
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("svg-to-raster");
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        encodeJxlSpy.mockRestore();
        decodeSpy.mockRestore();
      }
    }
  });
});

describe("registerFetchUrlsRoute preview decode tmpdir write faults (#3452)", () => {
  type FetchUrlsHandler = (req: unknown, reply: unknown) => Promise<unknown>;

  async function getFetchUrlsHandler(): Promise<FetchUrlsHandler> {
    const routes = new Map<string, FetchUrlsHandler>();
    const fakeApp = {
      post: (path: string, _opts: unknown, handler: FetchUrlsHandler) => {
        routes.set(path, handler);
      },
    } as unknown as FastifyInstance;
    await registerFetchUrlsRoute(fakeApp);
    const handler = routes.get("/api/v1/fetch-urls");
    if (!handler) throw new Error("fetch-urls route not registered");
    return handler;
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

  it.each(WRITE_FAULT_CASES)(
    "reports 503 %s (%s) from decodeHeic and decodeToSharpCompat (including TIFF-headed DNG) through reportEngineUnavailable while keeping the URL fetch non-fatal (#3452, #3486)",
    async (errnoCode, expectedCode) => {
      const handler = await getFetchUrlsHandler();
      const heicBytes = readFixture(fixtures.image.base.heic200);
      const psdBytes = readFixture(fixtures.image.formats("psd"));
      const tiffHeadedDng = await sharp({
        create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
      })
        .tiff()
        .toBuffer();

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
          if (href.endsWith(".dng")) {
            return new Response(new Uint8Array(tiffHeadedDng), {
              status: 200,
              headers: { "Content-Type": "image/x-adobe-dng" },
            });
          }
          if (href.endsWith(".psd")) {
            return new Response(new Uint8Array(psdBytes), {
              status: 200,
              headers: { "Content-Type": "image/vnd.adobe.photoshop" },
            });
          }
          return new Response(new Uint8Array(heicBytes), {
            status: 200,
            headers: { "Content-Type": "image/heic" },
          });
        }),
      );

      try {
        for (const makeFault of [
          () => normalizeOperationalWriteError(writeErrnoError(errnoCode)),
          () => writeErrnoError(errnoCode),
        ]) {
          reportEngineUnavailableMock.mockReset();
          loggerMock.warn.mockReset();
          putObjectMock.mockReset();
          decodeHeicMock.mockRejectedValueOnce(makeFault());
          const decodeSpy = vi
            .spyOn(formatDecoders, "decodeToSharpCompat")
            .mockRejectedValueOnce(makeFault())
            .mockRejectedValueOnce(makeFault());

          try {
            const reply = makeReply();
            await handler(
              {
                body: {
                  urls: [
                    "http://1.2.3.4:9999/photo.heic",
                    "http://1.2.3.4:9999/layers.psd",
                    "http://1.2.3.4:9999/photo.dng",
                  ],
                },
                log: loggerMock,
              },
              reply,
            );

            expect(reply.statusCode).toBe(200);
            const body = reply.payload as {
              results: Array<{
                success: boolean;
                filename?: string;
                width?: number;
                height?: number;
                previewUrl?: string | null;
              }>;
            };
            expect(body.results).toEqual([
              expect.objectContaining({
                success: true,
                filename: "photo.heic",
                previewUrl: null,
              }),
              expect.objectContaining({
                success: true,
                filename: "layers.psd",
                previewUrl: null,
              }),
              expect.objectContaining({
                success: true,
                filename: "photo.dng",
                width: 0,
                height: 0,
                previewUrl: null,
              }),
            ]);
            expect(putObjectMock).toHaveBeenCalledTimes(3);
            expect(reportEngineUnavailableMock).toHaveBeenCalledTimes(3);
            for (const call of reportEngineUnavailableMock.mock.calls) {
              expect(call[0]).toMatchObject({
                statusCode: 503,
                code: expectedCode,
              });
              expect(call[1]).toBe("fetch-urls");
            }
            expect(loggerMock.warn).not.toHaveBeenCalled();
          } finally {
            decodeSpy.mockRestore();
          }
        }
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("logs a warning without calling reportEngineUnavailable when decodeHeic or decodeToSharpCompat fails with a non-503 error (#3452, #3486)", async () => {
    const handler = await getFetchUrlsHandler();
    const heicBytes = readFixture(fixtures.image.base.heic200);
    const psdBytes = readFixture(fixtures.image.formats("psd"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (href.endsWith(".psd")) {
          return new Response(new Uint8Array(psdBytes), {
            status: 200,
            headers: { "Content-Type": "image/vnd.adobe.photoshop" },
          });
        }
        return new Response(new Uint8Array(heicBytes), {
          status: 200,
          headers: { "Content-Type": "image/heic" },
        });
      }),
    );

    const heicErr = new Error("corrupt heic");
    const psdErr = new Error("corrupt psd");
    decodeHeicMock.mockRejectedValueOnce(heicErr);
    const decodeSpy = vi.spyOn(formatDecoders, "decodeToSharpCompat").mockRejectedValueOnce(psdErr);
    try {
      const reply = makeReply();
      await handler(
        {
          body: {
            urls: ["http://1.2.3.4:9999/photo.heic", "http://1.2.3.4:9999/layers.psd"],
          },
          log: loggerMock,
        },
        reply,
      );
      expect(reply.statusCode).toBe(200);
      const body = reply.payload as {
        results: Array<{ success: boolean; filename?: string; previewUrl?: string | null }>;
      };
      expect(body.results).toEqual([
        expect.objectContaining({ success: true, filename: "photo.heic", previewUrl: null }),
        expect.objectContaining({ success: true, filename: "layers.psd", previewUrl: null }),
      ]);
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledTimes(2);
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: heicErr, jobId: expect.any(String), contentType: "image/heic" },
        "preview generation failed; result has no renderable preview",
      );
      expect(loggerMock.warn).toHaveBeenCalledWith(
        { err: psdErr, jobId: expect.any(String), contentType: "image/vnd.adobe.photoshop" },
        "preview generation failed; result has no renderable preview",
      );
    } finally {
      decodeSpy.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("forwards fileExt to decodeToSharpCompat, falls back to Sharp on a TIFF-headed DNG when the CLI decoder is missing, and skips Sharp preview when decode fails on CR2 or probe OOM (#3486)", async () => {
    const handler = await getFetchUrlsHandler();
    const tiffHeadedDng = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .tiff()
      .toBuffer();
    const cr2Bytes = readFixture(fixtures.image.formats("cr2"));
    const rafMagic = Buffer.from("FUJIFILMCCD-RAW 0201", "ascii");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (href.endsWith("/gallery/12345")) {
          return new Response(new Uint8Array(rafMagic), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        if (href.endsWith(".cr2")) {
          return new Response(new Uint8Array(cr2Bytes), {
            status: 200,
            headers: { "Content-Type": "image/x-canon-cr2" },
          });
        }
        return new Response(new Uint8Array(tiffHeadedDng), {
          status: 200,
          headers: { "Content-Type": "image/x-adobe-dng" },
        });
      }),
    );

    try {
      // 1. TIFF-headed DNG falls back to Sharp when decodeToSharpCompat rejects with DecoderUnavailableError
      const dngDecodeSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."))
        .mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
      try {
        const dngReply = makeReply();
        await handler(
          {
            body: {
              urls: ["http://1.2.3.4:9999/photo.dng", "http://1.2.3.4:9999/gallery/12345"],
            },
            log: loggerMock,
          },
          dngReply,
        );
        expect(dngDecodeSpy).toHaveBeenNthCalledWith(1, tiffHeadedDng, "raw", "dng");
        expect(dngDecodeSpy).toHaveBeenNthCalledWith(2, rafMagic, "raw", undefined);
        expect(dngReply.statusCode).toBe(200);
        const body = dngReply.payload as {
          results: Array<{
            success: boolean;
            filename?: string;
            contentType?: string;
            width?: number;
            height?: number;
            previewUrl?: string | null;
          }>;
        };
        expect(body.results).toEqual([
          expect.objectContaining({
            success: true,
            filename: "photo.dng",
            contentType: "image/x-dcraw",
            width: 12,
            height: 12,
            previewUrl: expect.stringMatching(/^\/api\/v1\/download\/.+\/preview-photo\.webp$/),
          }),
          expect.objectContaining({
            success: true,
            contentType: "image/x-dcraw",
            width: 0,
            height: 0,
            previewUrl: null,
          }),
        ]);
        expect(putObjectMock).toHaveBeenCalledTimes(3);
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        dngDecodeSpy.mockRestore();
      }

      // 2. CR2 (whose header Sharp reads but pixels Sharp cannot decode) reports ENGINE_UNAVAILABLE
      putObjectMock.mockReset();
      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      const cr2DecodeSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
      try {
        const cr2Reply = makeReply();
        await handler(
          {
            body: { urls: ["http://1.2.3.4:9999/photo.cr2"] },
            log: loggerMock,
          },
          cr2Reply,
        );
        expect(cr2DecodeSpy).toHaveBeenCalledOnce();
        expect(cr2DecodeSpy.mock.calls[0]?.[0]?.equals(cr2Bytes)).toBe(true);
        expect(cr2DecodeSpy.mock.calls[0]?.slice(1)).toEqual(["raw", "cr2"]);
        expect(cr2Reply.statusCode).toBe(200);
        const body = cr2Reply.payload as {
          results: Array<{
            success: boolean;
            filename?: string;
            width?: number;
            height?: number;
            previewUrl?: string | null;
          }>;
        };
        expect(body.results).toEqual([
          expect.objectContaining({
            success: true,
            filename: "photo.cr2",
            width: 0,
            height: 0,
            previewUrl: null,
          }),
        ]);
        expect(putObjectMock).toHaveBeenCalledTimes(1);
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("fetch-urls");
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        cr2DecodeSpy.mockRestore();
      }

      // 3. DNG Sharp fallback probe throwing V8 RangeError preserves DecoderOutOfMemoryError
      putObjectMock.mockReset();
      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      const dngOomProbeSpy = vi
        .spyOn(formatDecoders, "decodeToSharpCompat")
        .mockRejectedValueOnce(new DecoderUnavailableError("No dcraw_emu found."));
      const rawSpy = vi.spyOn(sharp.prototype, "raw").mockImplementationOnce(function (
        this: sharp.Sharp,
      ) {
        return {
          toBuffer: async () => {
            throw new RangeError("Array buffer allocation failed");
          },
        } as unknown as sharp.Sharp;
      });
      try {
        const probeOomReply = makeReply();
        await handler(
          {
            body: { urls: ["http://1.2.3.4:9999/photo.dng"] },
            log: loggerMock,
          },
          probeOomReply,
        );
        expect(probeOomReply.statusCode).toBe(200);
        const body = probeOomReply.payload as {
          results: Array<{
            success: boolean;
            filename?: string;
            width?: number;
            height?: number;
            previewUrl?: string | null;
          }>;
        };
        expect(body.results).toEqual([
          expect.objectContaining({
            success: true,
            filename: "photo.dng",
            width: 0,
            height: 0,
            previewUrl: null,
          }),
        ]);
        expect(putObjectMock).toHaveBeenCalledTimes(1);
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
        });
        expect(loggerMock.warn).not.toHaveBeenCalled();
      } finally {
        rawSpy.mockRestore();
        dngOomProbeSpy.mockRestore();
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("routes preview WebP V8 buffer allocation OOM and raw decode SIGKILL/OOM through reportEngineUnavailable (#3383, #3486)", async () => {
    const handler = await getFetchUrlsHandler();
    const heicBytes = readFixture(fixtures.image.base.heic200);
    const psdBytes = readFixture(fixtures.image.formats("psd"));
    const tiffBytes = await sharp({
      create: { width: 12, height: 12, channels: 3, background: { r: 40, g: 80, b: 120 } },
    })
      .tiff()
      .toBuffer();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (href.endsWith(".tiff") || href.endsWith(".dng")) {
          return new Response(new Uint8Array(tiffBytes), {
            status: 200,
            headers: {
              "Content-Type": href.endsWith(".dng") ? "image/x-adobe-dng" : "image/tiff",
            },
          });
        }
        if (href.endsWith(".psd")) {
          return new Response(new Uint8Array(psdBytes), {
            status: 200,
            headers: { "Content-Type": "image/vnd.adobe.photoshop" },
          });
        }
        return new Response(new Uint8Array(heicBytes), {
          status: 200,
          headers: { "Content-Type": "image/heic" },
        });
      }),
    );

    try {
      // 1. Inline preview sharp(decodedBuffer).webp({ quality: 80 }).toBuffer() rejects with V8 RangeError
      const webpSpy = vi
        .spyOn(sharp.prototype, "webp")
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
              throw new RangeError("Invalid WebP parameter");
            },
          } as unknown as sharp.Sharp;
        });
      try {
        const tiffReply = makeReply();
        await handler(
          {
            body: { urls: ["http://1.2.3.4:9999/photo.tiff"] },
            log: loggerMock,
          },
          tiffReply,
        );
        expect(tiffReply.statusCode).toBe(200);
        const body = tiffReply.payload as {
          results: Array<{ success: boolean; filename?: string; previewUrl?: string | null }>;
        };
        expect(body.results).toEqual([
          expect.objectContaining({
            success: true,
            filename: "photo.tiff",
            previewUrl: null,
          }),
        ]);
        expect(reportEngineUnavailableMock).toHaveBeenCalledOnce();
        expect(reportEngineUnavailableMock.mock.calls[0]?.[0]).toMatchObject({
          statusCode: 503,
          code: "ENGINE_UNAVAILABLE",
          cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
        });
        expect(reportEngineUnavailableMock.mock.calls[0]?.[1]).toBe("fetch-urls");
        expect(loggerMock.warn).not.toHaveBeenCalled();

        reportEngineUnavailableMock.mockReset();
        loggerMock.warn.mockReset();
        const nonOomReply = makeReply();
        await handler(
          {
            body: { urls: ["http://1.2.3.4:9999/photo.tiff"] },
            log: loggerMock,
          },
          nonOomReply,
        );
        expect(nonOomReply.statusCode).toBe(200);
        expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
        expect(loggerMock.warn).toHaveBeenCalledOnce();
        expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
          "preview generation failed; result has no renderable preview",
        );
      } finally {
        webpSpy.mockRestore();
      }

      // 1b. 503 preview putObject error does not trigger reportEngineUnavailable
      reportEngineUnavailableMock.mockReset();
      loggerMock.warn.mockReset();
      putObjectMock
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          Object.assign(new Error("storage write failed"), { statusCode: 503 }),
        );
      const putErrReply = makeReply();
      await handler(
        {
          body: { urls: ["http://1.2.3.4:9999/photo.tiff"] },
          log: loggerMock,
        },
        putErrReply,
      );
      expect(putErrReply.statusCode).toBe(200);
      expect(reportEngineUnavailableMock).not.toHaveBeenCalled();
      expect(loggerMock.warn).toHaveBeenCalledOnce();
      expect(loggerMock.warn.mock.calls[0]?.[1]).toBe(
        "preview generation failed; result has no renderable preview",
      );

      // 2. Raw SIGKILL, V8 RangeError, and DecoderOutOfMemoryError at decodeHeic / decodeToSharpCompat (including TIFF-headed DNG)
      for (const makeRawOom of [
        () => Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" }),
        () => new RangeError("Array buffer allocation failed"),
        () => new DecoderOutOfMemoryError("raw", new Error("SIGKILL")),
      ]) {
        reportEngineUnavailableMock.mockReset();
        loggerMock.warn.mockReset();
        putObjectMock.mockReset();
        decodeHeicMock.mockRejectedValueOnce(makeRawOom());
        const decodeSpy = vi
          .spyOn(formatDecoders, "decodeToSharpCompat")
          .mockRejectedValueOnce(makeRawOom())
          .mockRejectedValueOnce(makeRawOom());

        try {
          const reply = makeReply();
          await handler(
            {
              body: {
                urls: [
                  "http://1.2.3.4:9999/photo.heic",
                  "http://1.2.3.4:9999/layers.psd",
                  "http://1.2.3.4:9999/photo.dng",
                ],
              },
              log: loggerMock,
            },
            reply,
          );
          expect(reply.statusCode).toBe(200);
          const body = reply.payload as {
            results: Array<{
              success: boolean;
              filename?: string;
              width?: number;
              height?: number;
              previewUrl?: string | null;
            }>;
          };
          expect(body.results).toEqual([
            expect.objectContaining({
              success: true,
              filename: "photo.heic",
              previewUrl: null,
            }),
            expect.objectContaining({
              success: true,
              filename: "layers.psd",
              previewUrl: null,
            }),
            expect.objectContaining({
              success: true,
              filename: "photo.dng",
              width: 0,
              height: 0,
              previewUrl: null,
            }),
          ]);
          expect(putObjectMock).toHaveBeenCalledTimes(3);
          expect(reportEngineUnavailableMock).toHaveBeenCalledTimes(3);
          for (const call of reportEngineUnavailableMock.mock.calls) {
            expect(call[0]).toMatchObject({
              statusCode: 503,
              code: "ENGINE_UNAVAILABLE",
              cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
            });
            expect(call[1]).toBe("fetch-urls");
          }
          expect(loggerMock.warn).not.toHaveBeenCalled();
        } finally {
          decodeSpy.mockRestore();
        }
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
