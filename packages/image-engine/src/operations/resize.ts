import { ToolInputError } from "@snapotter/shared";
import type { ResizeOptions, Sharp } from "../types.js";

export const MAX_RESIZE_PERCENTAGE = 1000;
export const MAX_RESIZE_OUTPUT_DIMENSION = 16383;
export const MAX_RESIZE_OUTPUT_PIXELS = 67_108_864;

function outputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  width: number | undefined,
  height: number | undefined,
  fit: ResizeOptions["fit"],
  withoutEnlargement: boolean,
): { width: number; height: number } {
  if (width !== undefined && height !== undefined) {
    if (fit === "inside" || fit === "outside") {
      const scale =
        fit === "inside"
          ? Math.min(width / sourceWidth, height / sourceHeight)
          : Math.max(width / sourceWidth, height / sourceHeight);
      const effectiveScale = withoutEnlargement ? Math.min(scale, 1) : scale;
      return {
        width: Math.max(1, Math.round(sourceWidth * effectiveScale)),
        height: Math.max(1, Math.round(sourceHeight * effectiveScale)),
      };
    }
    return { width, height };
  }

  if (width !== undefined) {
    const scale = withoutEnlargement ? Math.min(width / sourceWidth, 1) : width / sourceWidth;
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  }

  const targetHeight = height as number;
  const scale = withoutEnlargement
    ? Math.min(targetHeight / sourceHeight, 1)
    : targetHeight / sourceHeight;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export async function resize(image: Sharp, options: ResizeOptions): Promise<Sharp> {
  let { width, height, fit, withoutEnlargement, percentage } = options;

  if (percentage !== undefined) {
    if (percentage <= 0) {
      throw new ToolInputError("Resize percentage must be greater than 0");
    }
    if (!Number.isFinite(percentage) || percentage > MAX_RESIZE_PERCENTAGE) {
      throw new ToolInputError(`Resize percentage must not exceed ${MAX_RESIZE_PERCENTAGE}`);
    }
  }

  if (width !== undefined && width <= 0) {
    throw new ToolInputError("Resize width must be greater than 0");
  }
  if (height !== undefined && height <= 0) {
    throw new ToolInputError("Resize height must be greater than 0");
  }
  if (width === undefined && height === undefined && percentage === undefined) {
    throw new ToolInputError("Resize requires width, height, or percentage");
  }

  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new ToolInputError("Cannot determine image dimensions for resize");
  }

  if (percentage !== undefined) {
    width = Math.max(1, Math.round(metadata.width * (percentage / 100)));
    height = Math.max(1, Math.round(metadata.height * (percentage / 100)));
  }

  if (withoutEnlargement) {
    if (width !== undefined && width > metadata.width) width = metadata.width;
    if (height !== undefined && height > metadata.height) height = metadata.height;
  }

  const resolvedFit = fit ?? "cover";
  const target = outputDimensions(
    metadata.width,
    metadata.height,
    width,
    height,
    resolvedFit,
    withoutEnlargement ?? false,
  );
  if (target.width > MAX_RESIZE_OUTPUT_DIMENSION || target.height > MAX_RESIZE_OUTPUT_DIMENSION) {
    throw new ToolInputError(
      `Resize output must not exceed ${MAX_RESIZE_OUTPUT_DIMENSION} pixels on either side`,
    );
  }
  if (target.width * target.height > MAX_RESIZE_OUTPUT_PIXELS) {
    throw new ToolInputError(
      `Resize output must not exceed ${MAX_RESIZE_OUTPUT_PIXELS} total pixels`,
    );
  }

  return image.resize({
    width,
    height,
    fit: resolvedFit,
    withoutEnlargement: withoutEnlargement ?? false,
  });
}
