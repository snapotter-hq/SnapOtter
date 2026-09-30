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

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", () => ({
  decompressSvgz: mocks.decompressSvgz,
  sanitizeSvg: mocks.sanitizeSvg,
}));

import {
  DecoderOutOfMemoryError,
  DecoderUnavailableError,
} from "../../../apps/api/src/lib/format-decoders.js";
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

  it("uses Sharp's own decode when the CLI decoder is missing but Sharp reads the file", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(missingMagick());

    const result = await prepare("photo.dng");

    expect(result.buffer).toBe(ORIENTED);
  });

  it("keeps 422 for a CLI format the decoder rejected", async () => {
    detected("raw");
    mocks.decodeToSharpCompat.mockRejectedValue(new Error("Command failed: magick"));
    mocks.metadata.mockRejectedValue(new Error("Input buffer contains unsupported image format"));

    await expect(prepare("photo.nef")).rejects.toMatchObject({ statusCode: 422 });
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
