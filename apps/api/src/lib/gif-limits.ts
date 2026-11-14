import { MAX_RESIZE_OUTPUT_DIMENSION, MAX_RESIZE_OUTPUT_PIXELS } from "@snapotter/image-engine";
import { ToolInputError } from "@snapotter/shared";

/** Keep per-frame loops and retained encoded buffers bounded even for tiny frames. */
export const MAX_GIF_FRAMES = 500;
export const MAX_GIF_TOTAL_PIXELS = MAX_RESIZE_OUTPUT_PIXELS;

/**
 * Ceiling on the canvas Pillow builds for a GIF. The remove-gif-background
 * sidecar mirrors these numbers in gif_remove_bg.py; keep the two in sync.
 */
export const MAX_GIF_CANVAS_PIXELS = MAX_RESIZE_OUTPUT_PIXELS;
export const MAX_GIF_CANVAS_SIDE = MAX_RESIZE_OUTPUT_DIMENSION;

/**
 * libvips (libnsgif) ignores a logical screen wider or taller than this and
 * sizes the image to its frames, so past it the size sharp reports says
 * nothing about the screen the header declares.
 */
const LIBVIPS_GIF_SCREEN_LIMIT = 2048;

function colorTableBytes(packed: number): number {
  return packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
}

/** Skip a run of GIF data sub-blocks; returns the offset after the terminator, or -1. */
function skipSubBlocks(buffer: Buffer, offset: number): number {
  let pos = offset;
  while (pos < buffer.length) {
    const size = buffer[pos];
    pos += 1;
    if (size === 0) return pos;
    pos += size;
  }
  return -1;
}

/**
 * The canvas Pillow allocates for a GIF: the logical screen from the header,
 * grown to fit any frame that sits past its edge. Sharp sizes the same file by
 * different rules, so a header claiming 13000 x 13000 over 2 x 2 frames reads
 * as 2 x 2 to sharp while Pillow builds 169 MP per frame. Returns null when the
 * buffer is not a GIF. A truncated block list stops the walk with what it has.
 */
export function readGifCanvasSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 13 || buffer.toString("latin1", 0, 3) !== "GIF") return null;
  let width = buffer.readUInt16LE(6);
  let height = buffer.readUInt16LE(8);
  let pos = 13 + colorTableBytes(buffer[10] ?? 0);

  while (pos < buffer.length) {
    const marker = buffer[pos];
    if (marker === 0x21) {
      pos = skipSubBlocks(buffer, pos + 2);
    } else if (marker === 0x2c) {
      if (pos + 10 > buffer.length) break;
      const left = buffer.readUInt16LE(pos + 1);
      const top = buffer.readUInt16LE(pos + 3);
      width = Math.max(width, left + buffer.readUInt16LE(pos + 5));
      height = Math.max(height, top + buffer.readUInt16LE(pos + 7));
      // Descriptor, local color table, then the LZW minimum code size byte.
      pos = skipSubBlocks(buffer, pos + 10 + colorTableBytes(buffer[pos + 9] ?? 0) + 1);
    } else {
      break;
    }
    if (pos < 0) break;
  }
  return { width, height };
}

/**
 * Why a GIF's canvas is refused, or null when it is fine. The canvas may run
 * past what sharp decodes only inside the range libvips itself honours, so
 * Pillow never builds a canvas bigger than a GIF sharp would have accepted.
 */
export function gifCanvasRejection(
  canvas: { width: number; height: number },
  decodedWidth: number,
  decodedHeight: number,
): string | null {
  const { width, height } = canvas;
  const pixels = width * height;
  if (
    width > MAX_GIF_CANVAS_SIDE ||
    height > MAX_GIF_CANVAS_SIDE ||
    pixels > MAX_GIF_CANVAS_PIXELS
  ) {
    return `GIF canvas ${width} x ${height} is over the ${MAX_GIF_CANVAS_PIXELS.toLocaleString("en-US")} pixel limit`;
  }
  if (pixels > Math.max(decodedWidth * decodedHeight, LIBVIPS_GIF_SCREEN_LIMIT ** 2)) {
    return `GIF canvas ${width} x ${height} is larger than its ${decodedWidth} x ${decodedHeight} frames`;
  }
  return null;
}

/**
 * Pixels the animated background-removal sidecar may hold across all frames.
 * It keeps every coalesced input frame and every output frame as RGBA, so this
 * is 1,024 MiB of input frames and about 2 GiB with the outputs. 16383 squared
 * is also sharp's default limitInputPixels, which detectAnimation already hits
 * for the frames sharp sees; this applies it to the canvas Pillow builds.
 * gif_remove_bg.py mirrors the number; keep the two in sync.
 */
export const MAX_GIF_BG_TOTAL_PIXELS = MAX_RESIZE_OUTPUT_DIMENSION ** 2;

/**
 * Why an animation is too big for background removal, or null. framePixels is
 * the canvas each frame is coalesced onto (readGifCanvasSize for a GIF).
 */
export function gifBgWorkloadRejection(framePixels: number, frames: number): string | null {
  const totalPixels = framePixels * Math.max(1, frames);
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_GIF_BG_TOTAL_PIXELS) {
    return `Animation is ${totalPixels.toLocaleString("en-US")} pixels across ${frames} frames, over the ${MAX_GIF_BG_TOTAL_PIXELS.toLocaleString("en-US")} pixel limit. Use fewer frames or a smaller size.`;
  }
  return null;
}

/** Pixels per coalesced frame: the larger of what sharp decodes and the GIF canvas. */
export function animationFramePixels(buffer: Buffer, width: number, height: number): number {
  const canvas = readGifCanvasSize(buffer);
  return Math.max(width * height, canvas ? canvas.width * canvas.height : 0);
}

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
 * `oversizeCode` says whose fault an oversized canvas is: the uploaded file's
 * (IMAGE_TOO_LARGE) or the settings' when checking a planned output.
 */
export function assertGifWorkload(
  metadata: GifMetadataLike,
  label = "GIF input",
  oversizeCode: "IMAGE_TOO_LARGE" | "RESULT_TOO_LARGE" = "IMAGE_TOO_LARGE",
): GifWorkload {
  const width = metadata.width;
  const height = metadata.pageHeight ?? metadata.height;
  const frames = metadata.pages ?? 1;

  if (!positiveInteger(width) || !positiveInteger(height) || !positiveInteger(frames)) {
    throw new ToolInputError(`${label} dimensions could not be determined`, {
      code: "IMAGE_UNDECODABLE",
    });
  }
  if (frames > MAX_GIF_FRAMES) {
    throw new ToolInputError(`${label} must not exceed ${MAX_GIF_FRAMES} frames`, {
      code: "TOO_MANY_FRAMES",
    });
  }
  if (width > MAX_RESIZE_OUTPUT_DIMENSION || height > MAX_RESIZE_OUTPUT_DIMENSION) {
    throw new ToolInputError(
      `${label} must not exceed ${MAX_RESIZE_OUTPUT_DIMENSION} pixels on either side`,
      { code: oversizeCode },
    );
  }

  const framePixels = width * height;
  if (framePixels > MAX_RESIZE_OUTPUT_PIXELS) {
    throw new ToolInputError(
      `${label} must not exceed ${MAX_RESIZE_OUTPUT_PIXELS} pixels per frame`,
      { code: oversizeCode },
    );
  }

  const totalPixels = framePixels * frames;
  if (!Number.isSafeInteger(totalPixels) || totalPixels > MAX_GIF_TOTAL_PIXELS) {
    throw new ToolInputError(
      `${label} must not exceed ${MAX_GIF_TOTAL_PIXELS} total pixels across all frames`,
      { code: "TOO_MANY_PIXELS" },
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
