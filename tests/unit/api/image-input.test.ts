import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autoOrient: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  decodeAnyFormat: vi.fn(),
  decodeHeic: vi.fn(),
  decodeToSharpCompat: vi.fn(),
  decompressSvgz: vi.fn(),
  metadata: vi.fn(),
  raw: vi.fn(),
  resize: vi.fn(),
  sanitizeSvg: vi.fn(),
  toBuffer: vi.fn(),
  validateImageBuffer: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: mocks.metadata,
    raw: mocks.raw,
    resize: mocks.resize,
    toBuffer: mocks.toBuffer,
  })),
}));

vi.mock("../../../apps/api/src/lib/auto-orient.js", () => ({
  autoOrient: mocks.autoOrient,
}));

vi.mock("../../../apps/api/src/lib/file-validation.js", () => ({
  validateImageBuffer: mocks.validateImageBuffer,
}));

vi.mock("../../../apps/api/src/lib/format-decoders.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../apps/api/src/lib/format-decoders.js")>();
  return {
    asDecoderOutOfMemory: actual.asDecoderOutOfMemory,
    DecoderUnavailableError: actual.DecoderUnavailableError,
    DecoderOutOfMemoryError: actual.DecoderOutOfMemoryError,
    isDecoderUnavailable: actual.isDecoderUnavailable,
    decodeAnyFormat: mocks.decodeAnyFormat,
    decodeToSharpCompat: mocks.decodeToSharpCompat,
    needsCliDecode: (format: string) => format === "raw",
  };
});

vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: mocks.decodeHeic,
}));

// Keep the process logger off the real pino transport: an unlogged AVIF
// probe failure would otherwise build it and write under data/logs.
vi.mock("../../../apps/api/src/lib/logger.js", () => ({
  logger: mocks.logger,
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../apps/api/src/lib/svg-sanitize.js")>();
  return {
    ...actual,
    decompressSvgz: mocks.decompressSvgz,
    sanitizeSvg: mocks.sanitizeSvg,
  };
});

import {
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
} from "../../../apps/api/src/lib/format-decoders.js";
import { normalizeOperationalWriteError } from "../../../apps/api/src/lib/object-storage.js";
import { InputValidationError } from "../../../apps/api/src/modality/contract.js";
import { ImageInputHandler } from "../../../apps/api/src/modality/image-input.js";

const RAW = Buffer.from("raw");
const DECODED = Buffer.from("decoded");
const ORIENTED = Buffer.from("oriented");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.autoOrient.mockResolvedValue(ORIENTED);
  mocks.decodeAnyFormat.mockResolvedValue(DECODED);
  mocks.decodeHeic.mockResolvedValue(DECODED);
  mocks.decodeToSharpCompat.mockResolvedValue(DECODED);
  mocks.decompressSvgz.mockImplementation((value) => value);
  mocks.sanitizeSvg.mockImplementation((value) => value);
  mocks.metadata.mockResolvedValue({ width: 1_000, height: 1_000 });
  mocks.resize.mockReturnValue({ raw: mocks.raw });
  mocks.raw.mockReturnValue({ toBuffer: mocks.toBuffer });
  mocks.toBuffer.mockResolvedValue(Buffer.from("pixel"));
});

describe("ImageInputHandler resource bounds", () => {
  it("rejects an extreme image side before decoding or auto-orientation", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "jpeg",
      width: 40_001,
      height: 1,
    });

    await expect(
      new ImageInputHandler().prepare(RAW, "scan.jpg", {
        scratchDir: "/tmp/ocr",
        maxDimension: 40_000,
        maxPixels: 40_000_000,
      }),
    ).rejects.toThrow(/dimension safety limit.*40,001x1/i);

    expect(mocks.autoOrient).not.toHaveBeenCalled();
    expect(mocks.decodeHeic).not.toHaveBeenCalled();
    expect(mocks.decodeToSharpCompat).not.toHaveBeenCalled();
  });

  it("rejects a native image over the caller pixel cap before decoding", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "jpeg",
      width: 8_000,
      height: 6_000,
    });

    await expect(
      new ImageInputHandler().prepare(RAW, "scan.jpg", {
        scratchDir: "/tmp/ocr",
        maxPixels: 40_000_000,
      }),
    ).rejects.toBeInstanceOf(InputValidationError);

    expect(mocks.autoOrient).not.toHaveBeenCalled();
    expect(mocks.decodeToSharpCompat).not.toHaveBeenCalled();
  });

  it("passes pixel and cancellation bounds into a CLI decoder and validates its output", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "raw",
      width: 0,
      height: 0,
    });
    mocks.metadata.mockResolvedValue({ width: 2_000, height: 1_500 });
    const signal = new AbortController().signal;

    await expect(
      new ImageInputHandler().prepare(RAW, "scan.nef", {
        scratchDir: "/tmp/ocr",
        maxDimension: 40_000,
        maxPixels: 2_000_000,
        signal,
      }),
    ).rejects.toThrow(/pixel safety limit/i);

    expect(mocks.decodeToSharpCompat).toHaveBeenCalledWith(RAW, "raw", "nef", {
      maxDimension: 40_000,
      maxPixels: 2_000_000,
      signal,
    });
    expect(mocks.autoOrient).not.toHaveBeenCalled();
  });

  it("stops before starting a CLI decoder when the request is already canceled", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "raw",
      width: 0,
      height: 0,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      new ImageInputHandler().prepare(RAW, "scan.dng", {
        scratchDir: "/tmp/ocr",
        maxPixels: 40_000_000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(mocks.decodeToSharpCompat).not.toHaveBeenCalled();
  });

  it("passes the same bounds to HEIF decoding and returns the normalized image", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "heif",
      width: 1_000,
      height: 1_000,
    });
    const signal = new AbortController().signal;

    const result = await new ImageInputHandler().prepare(RAW, "scan.heic", {
      scratchDir: "/tmp/ocr",
      maxDimension: 40_000,
      maxPixels: 40_000_000,
      signal,
    });

    expect(mocks.decodeHeic).toHaveBeenCalledWith(RAW, {
      maxDimension: 40_000,
      maxPixels: 40_000_000,
      signal,
    });
    expect(result).toEqual({ buffer: ORIENTED, filename: "scan.png" });
  });
});

describe("ImageInputHandler request logger (#1417)", () => {
  it("hands opts.log to autoOrient so its warn lines carry the request binding", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "jpeg",
      width: 10,
      height: 10,
    });
    const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

    const result = await new ImageInputHandler().prepare(RAW, "scan.jpg", {
      scratchDir: "/tmp/ocr",
      log: log as never,
    });

    expect(mocks.autoOrient).toHaveBeenCalledWith(RAW, log);
    expect(result).toEqual({ buffer: ORIENTED, filename: "scan.jpg" });
  });
});

describe("ImageInputHandler decoder availability (#1428)", () => {
  const missingHeif = () => new DecoderUnavailableError("No HEIF decoder found.");
  const missingMagick = () => new DecoderUnavailableError("No ImageMagick found.");

  function prepare(filename: string) {
    return new ImageInputHandler().prepare(RAW, filename, { scratchDir: "/tmp/in" });
  }

  function detected(format: string) {
    mocks.validateImageBuffer.mockResolvedValue({ valid: true, format, width: 1, height: 1 });
  }

  it("turns a missing HEIF decoder into 503 ENGINE_UNAVAILABLE", async () => {
    detected("heif");
    mocks.decodeHeic.mockRejectedValue(missingHeif());

    await expect(prepare("photo.heic")).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      message: "No HEIF decoder found.",
    });
  });

  it("keeps the decoder's out-of-memory error as the 503's cause (#1628)", async () => {
    // Reporting tells it from a missing decoder by the cause's name, so the
    // wrapper has to carry the original through.
    detected("heif");
    mocks.decodeHeic.mockRejectedValue(
      new DecoderOutOfMemoryError("The HEIF decoder ran out of memory."),
    );

    await expect(prepare("photo.heic")).rejects.toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
    });
  });

  it("keeps 422 for a HEIC the decoder rejected", async () => {
    detected("heif");
    mocks.decodeHeic.mockRejectedValue(new Error("Command failed: heif-convert"));

    await expect(prepare("photo.heic")).rejects.toMatchObject({ statusCode: 422 });
  });

  it("turns a missing CLI decoder into 503 once Sharp cannot read the file either", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(missingMagick());
    mocks.metadata.mockRejectedValue(new Error("Input buffer contains unsupported image format"));

    await expect(prepare("photo.nef")).rejects.toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("turns a missing CLI decoder into 503 when Sharp reads the TIFF header but cannot decode the pixel stream (#2801)", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(missingMagick());
    mocks.toBuffer.mockRejectedValue(
      new Error("tiff2vips: Sorry, requested compression method is not configured"),
    );

    await expect(prepare("photo.cr2")).rejects.toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
    });
  });

  it("uses Sharp's own decode when the CLI decoder is missing but Sharp reads the file", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(missingMagick());

    const result = await prepare("photo.dng");

    expect(result.buffer).toBe(ORIENTED);
  });

  it("turns a CLI decoder out-of-memory error into 503 even when Sharp can read the header (#1453)", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(
      new DecoderOutOfMemoryError("The image decoder ran out of memory."),
    );

    await expect(prepare("photo.dng")).rejects.toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.objectContaining({ name: "DecoderOutOfMemoryError" }),
    });
    expect(mocks.metadata).not.toHaveBeenCalled();
  });

  it("keeps 422 for a CLI format the decoder rejected", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(new Error("Command failed: magick"));
    mocks.metadata.mockRejectedValue(new Error("Input buffer contains unsupported image format"));

    await expect(prepare("photo.nef")).rejects.toMatchObject({ statusCode: 422 });
  });

  it("keeps 422 when the CLI decoder rejected a TIFF-headed RAW whose header Sharp reads but pixels fail (#2801)", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(new Error("Command failed: dcraw_emu"));
    mocks.toBuffer.mockRejectedValue(
      new Error("tiff2vips: Sorry, requested compression method is not configured"),
    );

    await expect(prepare("photo.cr2")).rejects.toMatchObject({ statusCode: 422 });
  });

  it("turns a missing ImageMagick on the AVIF fallback into 503", async () => {
    detected("avif");
    mocks.toBuffer.mockRejectedValue(new Error("heif: Unsupported bitstream"));
    mocks.decodeAnyFormat.mockRejectedValue(missingMagick());

    await expect(prepare("photo.avif")).rejects.toMatchObject({
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
    });
    // the probe's refusal is logged before the decoder's absence is raised
    expect(mocks.logger.info).toHaveBeenCalledOnce();
  });

  it("keeps 422 when ImageMagick ran and still could not decode the AVIF, naming both failures", async () => {
    detected("avif");
    mocks.toBuffer.mockRejectedValue(new Error("heif: Unsupported bitstream"));
    // execFile ends its message with the tool's stderr, newline and all
    mocks.decodeAnyFormat.mockRejectedValue(
      new Error("Command failed: magick\nmagick: no decode delegate for `AVIF'\n"),
    );

    // both reasons survive, fallback first, then Sharp's, on one line (#1548)
    await expect(prepare("photo.avif")).rejects.toMatchObject({
      statusCode: 422,
      details:
        "Command failed: magick\nmagick: no decode delegate for `AVIF'; native decode: heif: Unsupported bitstream",
    });
  });

  it("answers 400 when the AVIF probe trips the pixel cap, without trying the CLI decoder", async () => {
    detected("avif");
    mocks.toBuffer.mockRejectedValue(new Error("Input image exceeds pixel limit"));

    await expect(prepare("photo.avif")).rejects.toMatchObject({
      statusCode: 400,
      message: "Input image exceeds pixel limit",
    });
    expect(mocks.decodeAnyFormat).not.toHaveBeenCalled();
    expect(mocks.logger.info).not.toHaveBeenCalled();
  });

  it("answers 400 when the AVIF CLI decoder's output exceeds the pixel cap", async () => {
    detected("avif");
    mocks.toBuffer.mockRejectedValue(new Error("heif: Unsupported bitstream"));
    mocks.decodeAnyFormat.mockRejectedValue(
      new Error("Decoded image exceeds the 50000000 pixel safety limit (9000x9000)"),
    );

    await expect(prepare("photo.avif")).rejects.toMatchObject({
      statusCode: 400,
      message: "Decoded image exceeds the 50000000 pixel safety limit (9000x9000)",
    });
  });
});

describe("ImageInputHandler AVIF fallback logging (#1548)", () => {
  function detected(format: string) {
    mocks.validateImageBuffer.mockResolvedValue({ valid: true, format, width: 1, height: 1 });
  }

  it("logs Sharp's refusal through the request logger when the CLI decoder takes over", async () => {
    detected("avif");
    mocks.toBuffer.mockRejectedValue(new Error("heif: Unsupported bitstream"));
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    const result = await new ImageInputHandler().prepare(RAW, "photo.avif", {
      scratchDir: "/tmp/in",
      log: log as never,
    });

    expect(result).toEqual({ buffer: ORIENTED, filename: "photo.png" });
    expect(mocks.decodeAnyFormat).toHaveBeenCalledWith(RAW, "avif", expect.any(Object));
    // the CLI decoder's output is what goes on to autoOrient, with the same logger
    expect(mocks.autoOrient).toHaveBeenCalledWith(DECODED, log);
    expect(log.info).toHaveBeenCalledOnce();
    expect(log.info.mock.calls[0][0]).toMatchObject({
      err: expect.objectContaining({ message: "heif: Unsupported bitstream" }),
      format: "avif",
    });
    expect(log.info.mock.calls[0][1]).toBe(
      "image-input: native AVIF decode failed, trying the CLI decoder",
    );
  });

  it("falls back to the process logger when no request logger is given", async () => {
    detected("avif");
    mocks.toBuffer.mockRejectedValue(new Error("heif: Unsupported bitstream"));

    await new ImageInputHandler().prepare(RAW, "photo.avif", { scratchDir: "/tmp/in" });

    expect(mocks.logger.info).toHaveBeenCalledOnce();
    expect(mocks.logger.info.mock.calls[0][1]).toBe(
      "image-input: native AVIF decode failed, trying the CLI decoder",
    );
  });

  it("does not log an abort during the probe as a decode failure", async () => {
    detected("avif");
    const controller = new AbortController();
    controller.abort();
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    await expect(
      new ImageInputHandler().prepare(RAW, "photo.avif", {
        scratchDir: "/tmp/in",
        signal: controller.signal,
        log: log as never,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(log.info).not.toHaveBeenCalled();
    expect(mocks.decodeAnyFormat).not.toHaveBeenCalled();
  });

  it("stays quiet when the native AVIF decode succeeds", async () => {
    detected("avif");
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

    await new ImageInputHandler().prepare(RAW, "photo.avif", {
      scratchDir: "/tmp/in",
      log: log as never,
    });

    expect(mocks.decodeAnyFormat).not.toHaveBeenCalled();
    expect(log.info).not.toHaveBeenCalled();
  });
});

describe("ImageInputHandler SVG sanitization abort signal (#2830)", () => {
  it("rethrows a timeout abort reason instead of wrapping it in InputValidationError", async () => {
    const controller = new AbortController();
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "svg",
      width: 100,
      height: 100,
    });
    mocks.sanitizeSvg.mockImplementation((buf) => {
      controller.abort("timeout");
      return buf;
    });

    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svg", {
        scratchDir: "/tmp/in",
        signal: controller.signal,
      }),
    ).rejects.toBe("timeout");
  });

  it("rethrows a user cancel AbortError during SVG sanitization without wrapping in InputValidationError", async () => {
    const controller = new AbortController();
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "svg",
      width: 100,
      height: 100,
    });
    mocks.decompressSvgz.mockImplementation((buf) => {
      controller.abort();
      return buf;
    });

    const err = await new ImageInputHandler()
      .prepare(RAW, "icon.svg", {
        scratchDir: "/tmp/in",
        signal: controller.signal,
      })
      .catch((e: unknown) => e);

    expect(err).not.toBeInstanceOf(InputValidationError);
    expect(err).toMatchObject({ name: "AbortError" });
  });

  it("still wraps client SVG/SVGZ sanitization rejections in InputValidationError", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "svg",
      width: 100,
      height: 100,
    });
    mocks.sanitizeSvg.mockImplementationOnce(() => {
      throw Object.assign(new Error("SVG exceeds maximum element count of 5000"), {
        statusCode: 400,
      });
    });

    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svg", {
        scratchDir: "/tmp/in",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 400,
      message: "SVG exceeds maximum element count of 5000",
    });

    mocks.decompressSvgz.mockImplementationOnce(() => {
      throw new Error("SVGZ file does not contain valid SVG content after decompression");
    });

    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svgz", {
        scratchDir: "/tmp/in",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 400,
      message: "SVGZ file does not contain valid SVG content after decompression",
    });
  });

  it("falls back to Invalid SVG when a non-Error client rejection object is thrown without an abort", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "svg",
      width: 100,
      height: 100,
    });
    mocks.sanitizeSvg.mockImplementationOnce(() => {
      throw { statusCode: 400 };
    });

    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svg", {
        scratchDir: "/tmp/in",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 400,
      message: "Invalid SVG",
    });
  });

  it("rethrows unexpected faults from decompressSvgz or sanitizeSvg instead of wrapping in InputValidationError (#3580)", async () => {
    mocks.validateImageBuffer.mockResolvedValue({
      valid: true,
      format: "svg",
      width: 100,
      height: 100,
    });

    const sanitizeFault = new TypeError("unexpected sanitizer fault");
    mocks.sanitizeSvg.mockImplementationOnce(() => {
      throw sanitizeFault;
    });
    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svg", {
        scratchDir: "/tmp/in",
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(sanitizeFault);

    const decompressFault = new TypeError("unexpected gunzip fault");
    mocks.decompressSvgz.mockImplementationOnce(() => {
      throw decompressFault;
    });
    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svgz", {
        scratchDir: "/tmp/in",
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(decompressFault);

    const v8Oom = new RangeError("Array buffer allocation failed");
    mocks.decompressSvgz.mockImplementationOnce(() => {
      throw v8Oom;
    });
    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svgz", {
        scratchDir: "/tmp/in",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.objectContaining({
        name: "DecoderOutOfMemoryError",
        cause: v8Oom,
      }),
    });

    mocks.sanitizeSvg.mockImplementationOnce(() => {
      throw v8Oom;
    });
    await expect(
      new ImageInputHandler().prepare(RAW, "icon.svg", {
        scratchDir: "/tmp/in",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.objectContaining({
        name: "DecoderOutOfMemoryError",
        cause: v8Oom,
      }),
    });
  });
});

describe("ImageInputHandler operational tmpdir write faults (#2800)", () => {
  function prepare(filename: string) {
    return new ImageInputHandler().prepare(RAW, filename, { scratchDir: "/tmp/in" });
  }

  function detected(format: string) {
    mocks.validateImageBuffer.mockResolvedValue({ valid: true, format, width: 1, height: 1 });
  }

  function errnoError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`${code}: temp write failed`), {
      code,
      syscall: "open",
    });
  }

  const cases: ReadonlyArray<readonly [string, string]> = [
    ["ENOSPC", "storage-full"],
    ["EDQUOT", "storage-full"],
    ["EACCES", "storage-not-writable"],
    ["EPERM", "storage-not-writable"],
    ["EROFS", "storage-not-writable"],
  ];

  it.each(cases)(
    "turns a %s write error in decodeHeic into 503 %s",
    async (errno, expectedCode) => {
      detected("heif");
      mocks.decodeHeic.mockRejectedValue(errnoError(errno));

      await expect(prepare("photo.heic")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: expectedCode,
      });
    },
  );

  it.each(cases)(
    "turns a %s write error in decodeToSharpCompat into 503 %s without falling back to Sharp",
    async (errno, expectedCode) => {
      detected("raw");
      mocks.decodeToSharpCompat.mockRejectedValue(errnoError(errno));

      await expect(prepare("photo.dng")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: expectedCode,
      });
      expect(mocks.metadata).not.toHaveBeenCalled();
    },
  );

  it.each(cases)(
    "turns a %s write error in the AVIF CLI fallback into 503 %s",
    async (errno, expectedCode) => {
      detected("avif");
      mocks.toBuffer.mockRejectedValue(new Error("heif: Unsupported bitstream"));
      mocks.decodeAnyFormat.mockRejectedValue(errnoError(errno));

      await expect(prepare("photo.avif")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: expectedCode,
      });
    },
  );

  it.each(cases)(
    "preserves a normalized 503 %s SafeError from preflightEncodedDimensions / writeTempExclusive (%s) without falling back to Sharp on DNG (#3740)",
    async (errno, expectedCode) => {
      detected("raw");
      const normalized = normalizeOperationalWriteError(errnoError(errno));
      mocks.decodeToSharpCompat.mockRejectedValueOnce(normalized);

      await expect(
        new ImageInputHandler().prepare(RAW, "photo.dng", {
          scratchDir: "/tmp/in",
          maxPixels: 40_000_000,
        }),
      ).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: expectedCode,
        cause: normalized,
      });
      expect(mocks.metadata).not.toHaveBeenCalled();
    },
  );

  it("falls back to Sharp on DNG and surfaces 503 ENGINE_UNAVAILABLE on NEF when preflightEncodedDimensions wraps a non-storage EMFILE temp-write failure (#3740)", async () => {
    detected("raw");
    const emfileErr = errnoError("EMFILE");
    const unavailable = new DecoderUnavailableError(
      "The server could not write a temporary file to check image dimensions.",
      emfileErr,
    );
    mocks.decodeToSharpCompat.mockRejectedValueOnce(unavailable);

    const dngResult = await new ImageInputHandler().prepare(RAW, "photo.dng", {
      scratchDir: "/tmp/in",
      maxPixels: 40_000_000,
    });
    expect(dngResult).toEqual({ buffer: ORIENTED, filename: "photo.png" });

    mocks.decodeToSharpCompat.mockRejectedValueOnce(unavailable);
    mocks.metadata.mockRejectedValueOnce(
      new Error("Input buffer contains unsupported image format"),
    );

    await expect(
      new ImageInputHandler().prepare(RAW, "photo.nef", {
        scratchDir: "/tmp/in",
        maxPixels: 40_000_000,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.objectContaining({
        name: "DecoderUnavailableError",
        cause: emfileErr,
      }),
    });
  });

  it("surfaces 503 ENGINE_UNAVAILABLE with DecoderOutOfMemoryError cause when decodeHeic, decodeToSharpCompat, the DNG Sharp fallback probe, the AVIF probe/fallback, or the post-decode metadata check hits OOM (#3632)", async () => {
    const v8Oom = () => new RangeError("Array buffer allocation failed");
    const sigkillOom = () =>
      Object.assign(new Error("decoder exited SIGKILL"), { signal: "SIGKILL" });

    // 1. Raw OOM in decodeHeic and decodeToSharpCompat
    for (const makeOom of [v8Oom, sigkillOom]) {
      detected("heif");
      mocks.decodeHeic.mockRejectedValueOnce(makeOom());
      await expect(prepare("photo.heic")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.any(DecoderOutOfMemoryError),
      });

      detected("raw");
      mocks.decodeToSharpCompat.mockRejectedValueOnce(makeOom());
      mocks.metadata.mockClear();
      await expect(prepare("photo.dng")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.any(DecoderOutOfMemoryError),
      });
      expect(mocks.metadata).not.toHaveBeenCalled();
    }

    // 2. DNG Sharp fallback probe hits V8 OOM when decodeToSharpCompat failed with DecoderUnavailableError or a client Error
    for (const decodeFailure of [
      new DecoderUnavailableError("No dcraw_emu found."),
      new Error("corrupt dng"),
    ]) {
      detected("raw");
      mocks.decodeToSharpCompat.mockRejectedValueOnce(decodeFailure);
      mocks.toBuffer.mockRejectedValueOnce(v8Oom());

      await expect(prepare("photo.dng")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.any(DecoderOutOfMemoryError),
      });

      detected("raw");
      mocks.decodeToSharpCompat.mockRejectedValueOnce(decodeFailure);
      mocks.metadata.mockRejectedValueOnce(v8Oom());

      await expect(prepare("photo.dng")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.any(DecoderOutOfMemoryError),
      });

      detected("raw");
      mocks.decodeToSharpCompat.mockRejectedValueOnce(decodeFailure);
      mocks.toBuffer.mockRejectedValueOnce(new Error("Input image exceeds pixel limit"));

      await expect(prepare("photo.dng")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 400,
        message: "Input image exceeds pixel limit",
      });
    }

    // 3. AVIF native probe hits V8 OOM directly (without trying the CLI decoder) or CLI fallback hits raw OOM
    detected("avif");
    mocks.decodeAnyFormat.mockClear();
    mocks.toBuffer.mockRejectedValueOnce(v8Oom());
    await expect(prepare("photo.avif")).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.any(DecoderOutOfMemoryError),
    });
    expect(mocks.decodeAnyFormat).not.toHaveBeenCalled();

    for (const makeOom of [v8Oom, sigkillOom]) {
      detected("avif");
      mocks.toBuffer.mockRejectedValueOnce(new Error("heif: Unsupported bitstream"));
      mocks.decodeAnyFormat.mockRejectedValueOnce(makeOom());
      await expect(prepare("photo.avif")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.any(DecoderOutOfMemoryError),
      });
    }

    // 4. Post-decode metadata re-check hits V8 OOM when maxPixels is set
    mocks.validateImageBuffer.mockResolvedValueOnce({
      valid: true,
      format: "jpeg",
      width: 100,
      height: 100,
    });
    mocks.metadata.mockRejectedValueOnce(v8Oom());
    await expect(
      new ImageInputHandler().prepare(RAW, "photo.jpg", {
        scratchDir: "/tmp/in",
        maxPixels: 40_000_000,
      }),
    ).rejects.toMatchObject({
      name: "InputValidationError",
      statusCode: 503,
      code: "ENGINE_UNAVAILABLE",
      cause: expect.any(DecoderOutOfMemoryError),
    });

    // 5. autoOrient hits DecoderOutOfMemoryError or raw V8 OOM (#3804), while non-OOM or abort rethrows unchanged
    for (const orientErr of [
      new DecoderOutOfMemoryError("The image decoder ran out of memory."),
      v8Oom(),
    ]) {
      detected("jpeg");
      mocks.autoOrient.mockRejectedValueOnce(orientErr);
      await expect(prepare("photo.jpg")).rejects.toMatchObject({
        name: "InputValidationError",
        statusCode: 503,
        code: "ENGINE_UNAVAILABLE",
        cause: expect.any(DecoderOutOfMemoryError),
      });
    }

    const unexpectedOrientErr = new TypeError("unexpected orient fault");
    detected("jpeg");
    mocks.autoOrient.mockRejectedValueOnce(unexpectedOrientErr);
    await expect(prepare("photo.jpg")).rejects.toBe(unexpectedOrientErr);

    const orientAbort = new AbortController();
    detected("jpeg");
    mocks.autoOrient.mockImplementationOnce(async () => {
      orientAbort.abort("orient-canceled");
      throw v8Oom();
    });
    await expect(
      new ImageInputHandler().prepare(RAW, "photo.jpg", {
        scratchDir: "/tmp/in",
        signal: orientAbort.signal,
      }),
    ).rejects.toBe("orient-canceled");
  });
});
