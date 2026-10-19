/**
 * Unit tests for postprocess helpers.
 *
 * Tests buildOutputName (output filename construction with tool-specific
 * suffix and extension fixup). This pure function was extracted from
 * tool-factory.ts during the job-spine refactor to apps/api/src/jobs/postprocess.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal mocks so the module loads without Postgres/Redis/sharp
vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  schema: { jobs: {}, userFiles: {} },
}));

const putObjectMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/object-storage.js", () => ({
  putObject: putObjectMock,
}));

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
vi.mock("../../../apps/api/src/modality/preview.js", () => ({
  videoPosterPreview: videoPosterPreviewMock,
  pdfFirstPagePreview: pdfFirstPagePreviewMock,
}));

const decodeHeicMock = vi.hoisted(() => vi.fn());
vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: decodeHeicMock,
}));

import {
  buildOutputName,
  CONTENT_TYPE_TO_EXT,
  generatePreview,
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
});
