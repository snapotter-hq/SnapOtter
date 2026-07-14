import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  autoOrient: vi.fn(),
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

vi.mock("../../../apps/api/src/lib/format-decoders.js", () => ({
  decodeAnyFormat: mocks.decodeAnyFormat,
  decodeToSharpCompat: mocks.decodeToSharpCompat,
  needsCliDecode: (format: string) => format === "raw",
}));

vi.mock("../../../apps/api/src/lib/heic-converter.js", () => ({
  decodeHeic: mocks.decodeHeic,
}));

vi.mock("../../../apps/api/src/lib/svg-sanitize.js", () => ({
  decompressSvgz: mocks.decompressSvgz,
  sanitizeSvg: mocks.sanitizeSvg,
}));

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
