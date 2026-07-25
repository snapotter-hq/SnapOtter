import { MAX_RESIZE_OUTPUT_DIMENSION, MAX_RESIZE_OUTPUT_PIXELS } from "@snapotter/image-engine";
import { ToolInputError } from "@snapotter/shared";

/** Keep per-frame loops and retained encoded buffers bounded even for tiny frames. */
export const MAX_GIF_FRAMES = 500;
export const MAX_GIF_TOTAL_PIXELS = MAX_RESIZE_OUTPUT_PIXELS;

export interface GifMetadataLike {
  width?: number;
  height?: number;
  pageHeight?: number;
  pages?: number;
}

export interface GifWorkload {
  width: number;
  height: number;
  frames: number;
  framePixels: number;
  totalPixels: number;
}

function positiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

/**
 * Validate dimensions before any animated decode or per-frame allocation.
 * Animated Sharp metadata exposes the individual frame height as pageHeight.
 */
export function assertGifWorkload(metadata: GifMetadataLike, label = "GIF input"): GifWorkload {
  const width = metadata.width;
  const height = metadata.pageHeight ?? metadata.height;
  const frames = metadata.pages ?? 1;

  if (!positiveInteger(width) || !positiveInteger(height) || !positiveInteger(frames)) {
    throw new ToolInputError(`${label} dimensions could not be determined`);
  }
  if (frames > MAX_GIF_FRAMES) {
    throw new ToolInputError(`${label} must not exceed ${MAX_GIF_FRAMES} frames`);
  }
  if (width > MAX_RESIZE_OUTPUT_DIMENSION || height > MAX_RESIZE_OUTPUT_DIMENSION) {
    throw new ToolInputError(
      `${label} must not exceed ${MAX_RESIZE_OUTPUT_DIMENSION} pixels on either side`,
    );
  }

  const framePixels = width * height;
  if (framePixels > MAX_RESIZE_OUTPUT_PIXELS) {
    throw new ToolInputError(
      `${label} must not exceed ${MAX_RESIZE_OUTPUT_PIXELS} pixels per frame`,
    );
  }

  const totalPixels = framePixels * frames;
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_GIF_TOTAL_PIXELS) {
    throw new ToolInputError(
      `${label} must not exceed ${MAX_GIF_TOTAL_PIXELS} total pixels across all frames`,
    );
  }

  return { width, height, frames, framePixels, totalPixels };
}

export function resolveGifResizeDimensions(
  source: Pick<GifWorkload, "width" | "height">,
  settings: { width?: number; height?: number; percentage?: number },
): { width: number; height: number } {
  if (settings.percentage !== undefined) {
    const scale = settings.percentage / 100;
    return {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    };
  }

  if (settings.width !== undefined && settings.height !== undefined) {
    const scale = Math.min(settings.width / source.width, settings.height / source.height);
    return {
      width: Math.max(1, Math.round(source.width * scale)),
      height: Math.max(1, Math.round(source.height * scale)),
    };
  }
  if (settings.width !== undefined) {
    const scale = settings.width / source.width;
    return {
      width: settings.width,
      height: Math.max(1, Math.round(source.height * scale)),
    };
  }
  if (settings.height !== undefined) {
    const scale = settings.height / source.height;
    return {
      width: Math.max(1, Math.round(source.width * scale)),
      height: settings.height,
    };
  }

  return { width: source.width, height: source.height };
}
