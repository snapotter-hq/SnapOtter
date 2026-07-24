import { resize, type Sharp } from "@snapotter/image-engine";
import { ToolInputError } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

const MAX_RESIZE_PERCENTAGE = 1000;
const MAX_RESIZE_OUTPUT_DIMENSION = 16383;
const MAX_RESIZE_OUTPUT_PIXELS = 67_108_864;

function imageWithMetadata(width: number, height: number) {
  const resized = { operation: "resize" } as unknown as Sharp;
  const resizeCall = vi.fn(() => resized);
  const metadata = vi.fn(async () => ({ width, height }));
  const image = { metadata, resize: resizeCall } as unknown as Sharp;

  return { image, metadata, resizeCall, resized };
}

describe("resize output allocation limits", () => {
  it("rejects the deterministic fuzz counterexample as typed input before resize", async () => {
    const { image, resizeCall } = imageWithMetadata(200, 150);

    await expect(resize(image, { percentage: 896202.8004871072 })).rejects.toBeInstanceOf(
      ToolInputError,
    );
    expect(resizeCall).not.toHaveBeenCalled();
  });

  it("preserves percentage semantics at the product boundary", async () => {
    const { image, resizeCall, resized } = imageWithMetadata(640, 320);

    await expect(resize(image, { percentage: MAX_RESIZE_PERCENTAGE })).resolves.toBe(resized);
    expect(resizeCall).toHaveBeenCalledWith({
      width: 6400,
      height: 3200,
      fit: "cover",
      withoutEnlargement: false,
    });
  });

  it("rejects a percentage immediately above the product boundary", async () => {
    const { image, resizeCall } = imageWithMetadata(1, 1);

    await expect(
      resize(image, { percentage: MAX_RESIZE_PERCENTAGE + Number.EPSILON * 1024 }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(resizeCall).not.toHaveBeenCalled();
  });

  it("uses actual metadata to reject a percentage-derived oversized side", async () => {
    const { image, metadata, resizeCall } = imageWithMetadata(2000, 1000);

    await expect(resize(image, { percentage: MAX_RESIZE_PERCENTAGE })).rejects.toBeInstanceOf(
      ToolInputError,
    );
    expect(metadata).toHaveBeenCalledOnce();
    expect(resizeCall).not.toHaveBeenCalled();
  });

  it("allows the exact output dimension boundary and rejects one pixel above it", async () => {
    const atBoundary = imageWithMetadata(MAX_RESIZE_OUTPUT_DIMENSION, 1);
    await expect(
      resize(atBoundary.image, {
        width: MAX_RESIZE_OUTPUT_DIMENSION,
        height: 1,
        fit: "fill",
      }),
    ).resolves.toBe(atBoundary.resized);

    const aboveBoundary = imageWithMetadata(MAX_RESIZE_OUTPUT_DIMENSION, 1);
    await expect(
      resize(aboveBoundary.image, {
        width: MAX_RESIZE_OUTPUT_DIMENSION + 1,
        height: 1,
        fit: "fill",
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(aboveBoundary.resizeCall).not.toHaveBeenCalled();
  });

  it("allows the exact output pixel boundary and rejects one row above it", async () => {
    const boundarySide = Math.sqrt(MAX_RESIZE_OUTPUT_PIXELS);
    expect(Number.isInteger(boundarySide)).toBe(true);

    const atBoundary = imageWithMetadata(boundarySide, boundarySide);
    await expect(
      resize(atBoundary.image, { width: boundarySide, height: boundarySide, fit: "fill" }),
    ).resolves.toBe(atBoundary.resized);

    const aboveBoundary = imageWithMetadata(boundarySide, boundarySide + 1);
    await expect(
      resize(aboveBoundary.image, {
        width: boundarySide,
        height: boundarySide + 1,
        fit: "fill",
      }),
    ).rejects.toBeInstanceOf(ToolInputError);
    expect(aboveBoundary.resizeCall).not.toHaveBeenCalled();
  });

  it("applies withoutEnlargement before validating the effective output", async () => {
    const { image, resizeCall, resized } = imageWithMetadata(200, 150);

    await expect(
      resize(image, {
        percentage: MAX_RESIZE_PERCENTAGE,
        withoutEnlargement: true,
      }),
    ).resolves.toBe(resized);
    expect(resizeCall).toHaveBeenCalledWith({
      width: 200,
      height: 150,
      fit: "cover",
      withoutEnlargement: true,
    });
  });
});
