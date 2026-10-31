/**
 * Unit tests for postprocess helpers.
 *
 * Tests buildOutputName (output filename construction with tool-specific
 * suffix and extension fixup). This pure function was extracted from
 * tool-factory.ts during the job-spine refactor to apps/api/src/jobs/postprocess.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_EXT_TO_MIME, IMAGE_MIME_TO_EXT } from "../../../packages/shared/src/image-mime.js";
import { CAMERA_RAW_INPUTS } from "../../../packages/shared/src/modality.js";

// Minimal mocks so the module loads without Postgres/Redis/sharp
const parentLookupMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: parentLookupMock,
      }),
    }),
  },
  schema: { jobs: {}, userFiles: { id: "id" }, users: { id: "id", storageUsed: "storageUsed" } },
}));

const saveFileMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/file-storage.js", () => ({
  saveFile: saveFileMock,
  deleteStoredFile: vi.fn(),
}));

const quotaRefusalMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/quota.js", () => ({
  quotaRefusal: quotaRefusalMock,
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

const sharpMock = vi.hoisted(() => vi.fn());
vi.mock("sharp", () => ({
  default: sharpMock,
}));

const loggerWarnMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: {
    warn: loggerWarnMock,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const videoPosterPreviewMock = vi.hoisted(() => vi.fn());
const pdfFirstPagePreviewMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/modality/preview.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/modality/preview.js")>();
  return {
    ...actual,
    videoPosterPreview: videoPosterPreviewMock,
    pdfFirstPagePreview: pdfFirstPagePreviewMock,
  };
});

const decodeHeicMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: decodeHeicMock,
}));

const decodeToSharpCompatMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  return {
    ...actual,
    decodeToSharpCompat: decodeToSharpCompatMock,
  };
});

import {
  type AutoSaveTx,
  buildOutputName,
  CONTENT_TYPE_TO_EXT,
  generatePreview,
  stageAutoSaveToLibrary,
} from "../../../apps/api/src/jobs/postprocess.js";

describe("buildOutputName", () => {
  it("appends toolId suffix when filename is unchanged", () => {
    const result = buildOutputName("photo.png", "photo.png", "resize", "image/png");
    expect(result).toBe("photo_resize.png");
  });

  it("does not add suffix when tool renames the file", () => {
    const result = buildOutputName("converted.jpg", "photo.png", "convert", "image/jpeg");
    expect(result).toBe("converted.jpg");
  });

  it("fixes extension mismatch between content-type and filename", () => {
    const result = buildOutputName("output.png", "input.bmp", "convert", "image/jpeg");
    expect(result).toBe("output.jpg");
  });

  it("applies both suffix and extension fixup when needed", () => {
    const result = buildOutputName("input.bmp", "input.bmp", "convert", "image/jpeg");
    expect(result).toBe("input_convert.jpg");
  });

  it("preserves extension when content-type matches", () => {
    const result = buildOutputName("output.webp", "input.png", "compress", "image/webp");
    expect(result).toBe("output.webp");
  });

  it.each([
    ["photo.jpeg", "image/jpeg", "photo_edit-metadata.jpeg"],
    ["PHOTO.JPEG", "image/jpeg", "PHOTO_edit-metadata.JPEG"],
    ["scan.tif", "image/tiff", "scan_edit-metadata.tif"],
    ["cursor.cur", "image/x-icon", "cursor_edit-metadata.cur"],
    ["tile.j2k", "image/jp2", "tile_edit-metadata.j2k"],
    ["tile.j2c", "image/jp2", "tile_edit-metadata.j2c"],
    ["tile.jpc", "image/jp2", "tile_edit-metadata.jpc"],
    ["tile.jpf", "image/jp2", "tile_edit-metadata.jpf"],
    ["frame.fit", "image/fits", "frame_edit-metadata.fit"],
    ["frame.fts", "image/fits", "frame_edit-metadata.fts"],
    ["figure.epsf", "application/postscript", "figure_edit-metadata.epsf"],
  ])(
    "preserves alternate extension on %s when it already maps to %s (#3206)",
    (filename, contentType, expected) => {
      expect(buildOutputName(filename, filename, "edit-metadata", contentType)).toBe(expected);
    },
  );

  it("preserves every non-svgz IMAGE_EXT_TO_MIME extension when contentType matches (#3206)", () => {
    for (const [ext, contentType] of Object.entries(IMAGE_EXT_TO_MIME)) {
      if (ext === "svgz") continue;
      expect(buildOutputName(`sample.${ext}`, `sample.${ext}`, "edit-metadata", contentType)).toBe(
        `sample_edit-metadata.${ext}`,
      );
    }
  });

  it("preserves or rewrites alternate extension when resultFilename differs from originalFilename (#3206)", () => {
    expect(buildOutputName("custom.jpeg", "photo.jpeg", "watermark", "image/jpeg")).toBe(
      "custom.jpeg",
    );
    expect(buildOutputName("custom.jpeg", "photo.jpeg", "convert", "image/png")).toBe("custom.png");
  });

  it("rewrites .svgz to .svg on image/svg+xml output since worker ingress decompresses SVGZ to plain XML (#3206)", () => {
    expect(buildOutputName("icon.svgz", "icon.svgz", "edit-metadata", "image/svg+xml")).toBe(
      "icon_edit-metadata.svg",
    );
  });

  it("still rewrites an alternate extension when output content-type changes (#3206)", () => {
    expect(buildOutputName("photo.jpeg", "photo.jpeg", "convert", "image/png")).toBe(
      "photo_convert.png",
    );
  });

  it("handles filenames without extension", () => {
    const result = buildOutputName("photo", "photo", "resize", "image/png");
    expect(result).toBe("photo_resize");
  });
});

describe("CONTENT_TYPE_TO_EXT", () => {
  it("maps common image MIME types to extensions", () => {
    expect(CONTENT_TYPE_TO_EXT["image/jpeg"]).toBe(".jpg");
    expect(CONTENT_TYPE_TO_EXT["image/png"]).toBe(".png");
    expect(CONTENT_TYPE_TO_EXT["image/webp"]).toBe(".webp");
    expect(CONTENT_TYPE_TO_EXT["image/gif"]).toBe(".gif");
    expect(CONTENT_TYPE_TO_EXT["image/svg+xml"]).toBe(".svg");
  });
});

describe("generatePreview", () => {
  beforeEach(() => {
    putObjectMock.mockReset();
    sharpMock.mockReset();
    loggerWarnMock.mockReset();
    videoPosterPreviewMock.mockReset();
    pdfFirstPagePreviewMock.mockReset();
    decodeHeicMock.mockReset();
    decodeToSharpCompatMock.mockReset();
  });

  it.each([
    "application/epub+zip",
    "text/html",
    "text/markdown",
    "text/plain",
    "text/csv",
    "application/json",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
  ])(
    "returns undefined without invoking Sharp or logger.warn for %s (#2664)",
    async (contentType) => {
      const key = await generatePreview(Buffer.from("document content"), contentType, "job-2664");

      expect(key).toBeUndefined();
      expect(sharpMock).not.toHaveBeenCalled();
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(loggerWarnMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/avif",
  ])("returns undefined without invoking Sharp for browser-previewable %s", async (contentType) => {
    const key = await generatePreview(Buffer.from("image content"), contentType, "job-2664");

    expect(key).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("stores a WebP poster when videoPosterPreview succeeds and returns undefined when it returns null", async () => {
    const poster = Buffer.from("webp-poster");
    videoPosterPreviewMock.mockResolvedValueOnce(poster);

    const key = await generatePreview(Buffer.from("mp4-bytes"), "video/mp4", "job-vid");
    expect(key).toBe("outputs/job-vid/preview.webp");
    expect(putObjectMock).toHaveBeenCalledWith("outputs/job-vid/preview.webp", poster);
    expect(sharpMock).not.toHaveBeenCalled();

    putObjectMock.mockReset();
    videoPosterPreviewMock.mockResolvedValueOnce(null);
    const missing = await generatePreview(Buffer.from("mp4-bytes"), "video/mp4", "job-vid");
    expect(missing).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("returns undefined for audio/* without invoking Sharp", async () => {
    const key = await generatePreview(Buffer.from("audio-bytes"), "audio/mpeg", "job-aud");
    expect(key).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("stores a first-page PNG when pdfFirstPagePreview succeeds and returns undefined when it returns null", async () => {
    const pagePng = Buffer.from("png-page");
    pdfFirstPagePreviewMock.mockResolvedValueOnce(pagePng);

    const key = await generatePreview(Buffer.from("pdf-bytes"), "application/pdf", "job-pdf");
    expect(key).toBe("outputs/job-pdf/preview.png");
    expect(putObjectMock).toHaveBeenCalledWith("outputs/job-pdf/preview.png", pagePng);
    expect(sharpMock).not.toHaveBeenCalled();

    putObjectMock.mockReset();
    pdfFirstPagePreviewMock.mockResolvedValueOnce(null);
    const missing = await generatePreview(Buffer.from("pdf-bytes"), "application/pdf", "job-pdf");
    expect(missing).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("logs a warning and returns undefined when videoPosterPreview or putObject rejects on video/* (#2870)", async () => {
    const scratchErr = Object.assign(new Error("ENOSPC: no space left on device"), {
      code: "ENOSPC",
      syscall: "mkdir",
    });
    videoPosterPreviewMock.mockRejectedValueOnce(scratchErr);

    const key1 = await generatePreview(Buffer.from("mp4-bytes"), "video/mp4", "job-vid-err");
    expect(key1).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: scratchErr, jobId: "job-vid-err", contentType: "video/mp4" },
      "preview generation failed; result has no renderable preview",
    );

    loggerWarnMock.mockReset();
    const putErr = Object.assign(new Error("storage write failed"), { statusCode: 503 });
    videoPosterPreviewMock.mockResolvedValueOnce(Buffer.from("webp-poster"));
    putObjectMock.mockRejectedValueOnce(putErr);

    const key2 = await generatePreview(Buffer.from("mp4-bytes"), "video/mp4", "job-vid-put-err");
    expect(key2).toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: putErr, jobId: "job-vid-put-err", contentType: "video/mp4" },
      "preview generation failed; result has no renderable preview",
    );
  });

  it("logs a warning and returns undefined when pdfFirstPagePreview or putObject rejects on application/pdf (#2870)", async () => {
    const scratchErr = Object.assign(new Error("EACCES: permission denied"), {
      code: "EACCES",
      syscall: "mkdir",
    });
    pdfFirstPagePreviewMock.mockRejectedValueOnce(scratchErr);

    const key1 = await generatePreview(Buffer.from("pdf-bytes"), "application/pdf", "job-pdf-err");
    expect(key1).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: scratchErr, jobId: "job-pdf-err", contentType: "application/pdf" },
      "preview generation failed; result has no renderable preview",
    );

    loggerWarnMock.mockReset();
    const putErr = Object.assign(new Error("storage write failed"), { statusCode: 503 });
    pdfFirstPagePreviewMock.mockResolvedValueOnce(Buffer.from("png-page"));
    putObjectMock.mockRejectedValueOnce(putErr);

    const key2 = await generatePreview(
      Buffer.from("pdf-bytes"),
      "application/pdf",
      "job-pdf-put-err",
    );
    expect(key2).toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: putErr, jobId: "job-pdf-put-err", contentType: "application/pdf" },
      "preview generation failed; result has no renderable preview",
    );
  });

  it("routes SIGKILL / DecoderOutOfMemoryError from videoPosterPreview and pdfFirstPagePreview through reportEngineUnavailable and returns undefined (#3353)", async () => {
    const { DecoderOutOfMemoryError } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );
    const vidOom = new DecoderOutOfMemoryError(
      "The video preview engine ran out of memory decoding this video, or was killed.",
      Object.assign(new Error("ffmpeg exited SIGKILL: "), { signal: "SIGKILL" }),
    );
    videoPosterPreviewMock.mockRejectedValueOnce(vidOom);

    const vidKey = await generatePreview(
      Buffer.from("mp4-bytes"),
      "video/mp4",
      "job-vid-oom",
      "vid-oom-tool",
    );
    expect(vidKey).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ENGINE_UNAVAILABLE",
        cause: "DecoderOutOfMemoryError",
        toolId: "vid-oom-tool",
      }),
      "Tool engine unavailable during input preparation",
    );

    loggerWarnMock.mockReset();
    const pdfSigkill = Object.assign(new Error("gs exited SIGKILL: "), { signal: "SIGKILL" });
    pdfFirstPagePreviewMock.mockRejectedValueOnce(pdfSigkill);

    const pdfKey = await generatePreview(
      Buffer.from("pdf-bytes"),
      "application/pdf",
      "job-pdf-oom",
      "pdf-oom-tool",
    );
    expect(pdfKey).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ENGINE_UNAVAILABLE",
        cause: "DecoderOutOfMemoryError",
        toolId: "pdf-oom-tool",
      }),
      "Tool engine unavailable during input preparation",
    );
  });

  it.each(["image/heic", "image/heif"])(
    "decodes %s via decodeHeic before passing to Sharp",
    async (contentType) => {
      const decoded = Buffer.from("decoded-png");
      const webpOut = Buffer.from("encoded-webp");
      decodeHeicMock.mockResolvedValueOnce(decoded);
      sharpMock.mockReturnValueOnce({
        webp: () => ({ toBuffer: async () => webpOut }),
      });

      const rawHeic = Buffer.from("raw-heic");
      const key = await generatePreview(rawHeic, contentType, "job-heic");

      expect(decodeHeicMock).toHaveBeenCalledWith(rawHeic);
      expect(sharpMock).toHaveBeenCalledWith(decoded);
      expect(putObjectMock).toHaveBeenCalledWith("outputs/job-heic/preview.webp", webpOut);
      expect(key).toBe("outputs/job-heic/preview.webp");
    },
  );

  it("logs a warning and returns undefined when decodeHeic rejects on a HEIC output", async () => {
    const err = new Error("heif-dec failed");
    decodeHeicMock.mockRejectedValueOnce(err);

    const key = await generatePreview(Buffer.from("bad-heic"), "image/heic", "job-heic-err");

    expect(key).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err, jobId: "job-heic-err", contentType: "image/heic" },
      "preview generation failed; result has no renderable preview",
    );
  });

  it.each([
    ["image/x-icon", "ico"],
    ["image/vnd.adobe.photoshop", "psd"],
    ["image/x-tga", "tga"],
    ["image/x-targa", "tga"],
    ["image/jxl", "jxl"],
    ["image/jp2", "jp2"],
    ["image/jpx", "jp2"],
    ["image/qoi", "qoi"],
    ["image/x-qoi", "qoi"],
    ["image/x-portable-pixmap", "ppm"],
    ["image/x-portable-graymap", "pgm"],
    ["image/x-portable-bitmap", "pbm"],
    ["image/x-portable-anymap", "ppm"],
    ["image/vnd.ms-dds", "dds"],
    ["image/x-dds", "dds"],
    ["image/x-exr", "exr"],
    ["image/vnd.radiance", "hdr"],
    ["image/x-dpx", "dpx"],
    ["image/x-cineon", "dpx"],
    ["image/fits", "fits"],
    ["image/x-eps", "eps"],
    ["application/postscript", "eps"],
  ])(
    "decodes %s via decodeToSharpCompat(%s) before passing to Sharp (#2704)",
    async (contentType, expectedFormat) => {
      const decoded = Buffer.from(`decoded-${expectedFormat}`);
      const webpOut = Buffer.from(`webp-${expectedFormat}`);
      decodeToSharpCompatMock.mockResolvedValueOnce(decoded);
      sharpMock.mockReturnValueOnce({
        webp: () => ({ toBuffer: async () => webpOut }),
      });

      const rawBuf = Buffer.from(`raw-${expectedFormat}`);
      const key = await generatePreview(rawBuf, contentType, "job-cli");

      expect(decodeToSharpCompatMock).toHaveBeenCalledWith(rawBuf, expectedFormat);
      expect(sharpMock).toHaveBeenCalledWith(decoded);
      expect(putObjectMock).toHaveBeenCalledWith("outputs/job-cli/preview.webp", webpOut);
      expect(key).toBe("outputs/job-cli/preview.webp");
      expect(loggerWarnMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ...CAMERA_RAW_INPUTS.map((dotExt) => {
      const ext = dotExt.slice(1);
      const mime = IMAGE_EXT_TO_MIME[ext];
      return [mime, ext] as const;
    }),
    ["image/x-dcraw", undefined] as const,
  ])(
    "decodes camera RAW %s via decodeToSharpCompat('raw', %s) before passing to Sharp (#3224)",
    async (contentType, expectedExt) => {
      const decoded = Buffer.from(`decoded-raw-${expectedExt ?? "dcraw"}`);
      const webpOut = Buffer.from(`webp-raw-${expectedExt ?? "dcraw"}`);
      decodeToSharpCompatMock.mockResolvedValueOnce(decoded);
      sharpMock.mockReturnValueOnce({
        webp: () => ({ toBuffer: async () => webpOut }),
      });

      const rawBuf = Buffer.from(`raw-bytes-${expectedExt ?? "dcraw"}`);
      const key = await generatePreview(rawBuf, contentType, "job-raw", "edit-metadata");

      expect(IMAGE_MIME_TO_EXT[contentType]).toBe(expectedExt);
      expect(decodeToSharpCompatMock).toHaveBeenCalledWith(rawBuf, "raw", expectedExt);
      expect(sharpMock).toHaveBeenCalledWith(decoded);
      expect(putObjectMock).toHaveBeenCalledWith("outputs/job-raw/preview.webp", webpOut);
      expect(key).toBe("outputs/job-raw/preview.webp");
      expect(loggerWarnMock).not.toHaveBeenCalled();
    },
  );

  it("falls back to Sharp on TIFF-headed DNG when decodeToSharpCompat rejects with DecoderUnavailableError (#3224)", async () => {
    const { DecoderUnavailableError } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );
    const webpOut = Buffer.from("webp-dng-fallback");
    decodeToSharpCompatMock.mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
    sharpMock
      .mockReturnValueOnce({
        metadata: async () => ({ width: 16, height: 16, format: "tiff" }),
      })
      .mockReturnValueOnce({
        resize: () => ({ raw: () => ({ toBuffer: async () => Buffer.from([1, 2, 3]) }) }),
      })
      .mockReturnValueOnce({
        webp: () => ({ toBuffer: async () => webpOut }),
      });

    const dngBuf = Buffer.from("tiff-headed-dng");
    const key = await generatePreview(
      dngBuf,
      "image/x-adobe-dng",
      "job-dng-fallback",
      "edit-metadata",
    );

    expect(decodeToSharpCompatMock).toHaveBeenCalledWith(dngBuf, "raw", "dng");
    expect(sharpMock).toHaveBeenCalledTimes(3);
    expect(sharpMock).toHaveBeenNthCalledWith(1, dngBuf);
    expect(sharpMock).toHaveBeenNthCalledWith(2, dngBuf);
    expect(sharpMock).toHaveBeenNthCalledWith(3, dngBuf);
    expect(putObjectMock).toHaveBeenCalledWith("outputs/job-dng-fallback/preview.webp", webpOut);
    expect(key).toBe("outputs/job-dng-fallback/preview.webp");
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it("reports engine unavailable on camera RAW when the Sharp fallback fails or when decodeToSharpCompat rejects with OOM or a 503 write fault (#3224)", async () => {
    const { DecoderOutOfMemoryError, DecoderUnavailableError } = await import(
      "../../../apps/api/src/lib/format-decoders.js"
    );

    decodeToSharpCompatMock.mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
    sharpMock
      .mockReturnValueOnce({
        metadata: async () => ({ width: 16, height: 16, format: "tiff" }),
      })
      .mockReturnValueOnce({
        resize: () => ({
          raw: () => ({
            toBuffer: async () => {
              throw new Error("tiffload_buffer: unsupported compression");
            },
          }),
        }),
      });

    const cr2Buf = Buffer.from("cr2-bytes");
    const cr2Key = await generatePreview(
      cr2Buf,
      "image/x-canon-cr2",
      "job-cr2-missing",
      "edit-metadata-cr2",
    );
    expect(cr2Key).toBeUndefined();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ENGINE_UNAVAILABLE",
        cause: "DecoderUnavailableError",
        toolId: "edit-metadata-cr2",
      }),
      "Tool engine unavailable during input preparation",
    );

    loggerWarnMock.mockReset();
    sharpMock.mockReset();
    decodeToSharpCompatMock.mockRejectedValueOnce(new DecoderUnavailableError("No LibRaw found."));
    sharpMock.mockReturnValueOnce({
      metadata: async () => {
        throw new Error("Input buffer contains unsupported image format");
      },
    });
    const cr3Key = await generatePreview(
      Buffer.from("cr3-bytes"),
      "image/x-canon-cr3",
      "job-cr3-missing",
      "edit-metadata-cr3",
    );
    expect(cr3Key).toBeUndefined();
    expect(sharpMock).toHaveBeenCalledOnce();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ENGINE_UNAVAILABLE",
        cause: "DecoderUnavailableError",
        toolId: "edit-metadata-cr3",
      }),
      "Tool engine unavailable during input preparation",
    );

    loggerWarnMock.mockReset();
    sharpMock.mockReset();
    decodeToSharpCompatMock.mockRejectedValueOnce(
      new DecoderOutOfMemoryError("raw", new Error("SIGKILL")),
    );
    const oomKey = await generatePreview(
      Buffer.from("dng-bytes"),
      "image/x-adobe-dng",
      "job-dng-oom",
      "edit-metadata-oom",
    );
    expect(oomKey).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ENGINE_UNAVAILABLE",
        cause: "DecoderOutOfMemoryError",
        toolId: "edit-metadata-oom",
      }),
      "Tool engine unavailable during input preparation",
    );

    loggerWarnMock.mockReset();
    sharpMock.mockReset();
    decodeToSharpCompatMock.mockRejectedValueOnce(
      Object.assign(new Error("dcraw_emu exited SIGKILL"), { signal: "SIGKILL" }),
    );
    const sigkillKey = await generatePreview(
      Buffer.from("dng-bytes"),
      "image/x-adobe-dng",
      "job-dng-sigkill",
      "edit-metadata-sigkill",
    );
    expect(sigkillKey).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ENGINE_UNAVAILABLE",
        cause: "DecoderOutOfMemoryError",
        toolId: "edit-metadata-sigkill",
      }),
      "Tool engine unavailable during input preparation",
    );

    loggerWarnMock.mockReset();
    sharpMock.mockReset();
    const enospc = Object.assign(new Error("ENOSPC: no space left on device"), {
      code: "ENOSPC",
      syscall: "open",
    });
    decodeToSharpCompatMock.mockRejectedValueOnce(enospc);
    const enospcKey = await generatePreview(
      Buffer.from("dng-bytes"),
      "image/x-adobe-dng",
      "job-dng-enospc",
      "edit-metadata-enospc",
    );
    expect(enospcKey).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "storage-full",
        cause: "SafeError",
        toolId: "edit-metadata-enospc",
      }),
      "Tool engine unavailable during input preparation",
    );
  });

  it("logs a warning with the original decode error when decodeToSharpCompat rejects with a non-503 error on camera RAW and Sharp fallback also fails (#3224)", async () => {
    const rawErr = new Error("corrupt cr2");
    decodeToSharpCompatMock.mockRejectedValueOnce(rawErr);
    sharpMock.mockReturnValueOnce({
      metadata: async () => {
        throw new Error("Input buffer contains unsupported image format");
      },
    });

    const key = await generatePreview(
      Buffer.from("bad-cr2"),
      "image/x-canon-cr2",
      "job-cr2-corrupt",
      "edit-metadata",
    );

    expect(key).toBeUndefined();
    expect(sharpMock).toHaveBeenCalledOnce();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledOnce();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: rawErr, jobId: "job-cr2-corrupt", contentType: "image/x-canon-cr2" },
      "preview generation failed; result has no renderable preview",
    );
  });

  it("logs a warning and returns undefined when decodeToSharpCompat rejects with a non-503 error (#2704)", async () => {
    const err = new Error("corrupt psd");
    decodeToSharpCompatMock.mockRejectedValueOnce(err);

    const key = await generatePreview(
      Buffer.from("bad-psd"),
      "image/vnd.adobe.photoshop",
      "job-psd-err",
    );

    expect(key).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err, jobId: "job-psd-err", contentType: "image/vnd.adobe.photoshop" },
      "preview generation failed; result has no renderable preview",
    );
  });

  it("routes 503 tmpdir write faults from decodeHeic and decodeToSharpCompat through reportEngineUnavailable (#3452)", async () => {
    const enospc = Object.assign(new Error("ENOSPC: no space left on device"), {
      code: "ENOSPC",
      syscall: "open",
    });
    decodeHeicMock.mockRejectedValueOnce(enospc);

    const heicKey = await generatePreview(
      Buffer.from("heic-bytes"),
      "image/heic",
      "job-heic-enospc",
      "convert-heic-enospc",
    );
    expect(heicKey).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledOnce();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "storage-full",
        cause: "SafeError",
        toolId: "convert-heic-enospc",
      }),
      "Tool engine unavailable during input preparation",
    );

    loggerWarnMock.mockReset();
    const eacces = Object.assign(new Error("EACCES: permission denied"), {
      code: "EACCES",
      syscall: "open",
    });
    decodeToSharpCompatMock.mockRejectedValueOnce(eacces);

    const psdKey = await generatePreview(
      Buffer.from("psd-bytes"),
      "image/vnd.adobe.photoshop",
      "job-psd-eacces",
      "convert-psd-eacces",
    );
    expect(psdKey).toBeUndefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledOnce();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "storage-not-writable",
        cause: "SafeError",
        toolId: "convert-psd-eacces",
      }),
      "Tool engine unavailable during input preparation",
    );

    loggerWarnMock.mockReset();
    decodeHeicMock.mockResolvedValueOnce(Buffer.from("decoded-png"));
    sharpMock.mockReturnValueOnce({
      webp: () => ({ toBuffer: async () => Buffer.from("webp-preview") }),
    });
    const putErr = Object.assign(new Error("storage write failed"), { statusCode: 503 });
    putObjectMock.mockRejectedValueOnce(putErr);

    const putFailKey = await generatePreview(
      Buffer.from("heic-bytes"),
      "image/heic",
      "job-heic-put-err",
      "convert-heic-put-err",
    );
    expect(putFailKey).toBeUndefined();
    expect(loggerWarnMock).toHaveBeenCalledOnce();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: putErr, jobId: "job-heic-put-err", contentType: "image/heic" },
      "preview generation failed; result has no renderable preview",
    );
  });
});

describe("stageAutoSaveToLibrary MIME normalization (#3223)", () => {
  beforeEach(() => {
    parentLookupMock.mockReset();
    saveFileMock.mockReset();
    quotaRefusalMock.mockReset();
    sharpMock.mockReset();
    parentLookupMock.mockResolvedValue([
      {
        id: "file-parent-1",
        userId: "user-1",
        version: 1,
        toolChain: ["upload"],
      },
    ]);
    saveFileMock.mockImplementation(async (_buf: Buffer, name: string) => `stored-${name}`);
    quotaRefusalMock.mockResolvedValue(null);
  });

  it("normalizes application/postscript to image/x-eps when inserting into user_files (#3223)", async () => {
    const inserted: Record<string, unknown>[] = [];
    const tx: AutoSaveTx = {
      select: (() => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: async () => [{ id: "file-parent-1" }],
            }),
          }),
        }),
      })) as unknown as AutoSaveTx["select"],
      insert: (() => ({
        values: async (row: Record<string, unknown>) => {
          inserted.push(row);
        },
      })) as unknown as AutoSaveTx["insert"],
      update: (() => ({
        set: () => ({
          where: async () => {},
        }),
      })) as unknown as AutoSaveTx["update"],
    };

    const staged = await stageAutoSaveToLibrary({
      fileId: "file-parent-1",
      saveMode: "new",
      userId: "user-1",
      buffer: Buffer.from("%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n"),
      outName: "photo_convert.eps",
      contentType: "application/postscript",
      toolId: "convert",
      jobId: "job-eps-autosave",
    });

    const commitRes = await staged.commit?.(tx);
    expect(commitRes?.fileId).toBeDefined();
    expect(sharpMock).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      userId: "user-1",
      originalName: "photo_convert.eps",
      storedName: "stored-photo_convert.eps",
      mimeType: "image/x-eps",
      width: null,
      height: null,
      version: 1,
      parentId: null,
      toolChain: ["upload", "convert"],
    });

    sharpMock.mockReturnValueOnce({
      metadata: async () => ({ width: 320, height: 240 }),
    });
    const stagedPng = await stageAutoSaveToLibrary({
      fileId: "file-parent-1",
      saveMode: "new",
      userId: "user-1",
      buffer: Buffer.from("png-bytes"),
      outName: "photo_convert.png",
      contentType: "image/png",
      toolId: "convert",
      jobId: "job-png-autosave",
    });
    await stagedPng.commit?.(tx);
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toMatchObject({
      originalName: "photo_convert.png",
      mimeType: "image/png",
      width: 320,
      height: 240,
    });
  });
});
