import { isToolInputError, ToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import { assertGifWorkload } from "./gif-limits.js";
import { asInputErrorIfUndecodable } from "./image-error.js";

export type AnimatedFormat = "gif" | "webp";

export interface AnimationOptions {
  format: AnimatedFormat;
  frameDelayMs: number;
  /** 0 loops forever. */
  loop: number;
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

interface Canvas {
  width: number;
  height: number;
}

/** The first image's upright size, read from its header without decoding pixels. */
async function readCanvas(image: Buffer): Promise<Canvas> {
  try {
    return (await sharp(image).metadata()).autoOrient;
  } catch (err) {
    throw await asInputErrorIfUndecodable(image, err);
  }
}

async function decodeFrame(image: Buffer, canvas: Canvas): Promise<Buffer> {
  try {
    return await sharp(image, { animated: false })
      .autoOrient()
      .resize(canvas.width, canvas.height, { fit: "contain", background: TRANSPARENT })
      .ensureAlpha()
      .png()
      .toBuffer();
  } catch (err) {
    throw await asInputErrorIfUndecodable(image, err);
  }
}

/**
 * Join still images into one animated GIF or WebP, one frame per image.
 *
 * Every frame is contained on the first image's canvas, so mixed sizes keep
 * their aspect ratio and the gaps stay transparent. The whole animation is
 * checked against the GIF workload cap from the first image's header, before
 * any frame is decoded.
 */
export async function framesToAnimation(
  images: Buffer[],
  options: AnimationOptions,
): Promise<Buffer> {
  const canvas = await readCanvas(images[0]);
  try {
    assertGifWorkload({ ...canvas, pages: images.length }, "Animated output", "RESULT_TOO_LARGE");
  } catch (err) {
    if (!isToolInputError(err)) throw err;
    throw new ToolInputError(
      `An animation of ${images.length} frames at ${canvas.width}x${canvas.height} is too large. Use fewer or smaller images.`,
      { code: "RESULT_TOO_LARGE" },
    );
  }

  const frames: Buffer[] = [];
  for (const image of images) {
    frames.push(await decodeFrame(image, canvas));
  }

  const joined = sharp(frames, { join: { across: 1, animated: true } });
  const delay = frames.map(() => options.frameDelayMs);
  // Sharp's GIF encoder reuses the input palette by default. The frames are
  // truecolour PNG with no palette worth keeping, so quantise from the pixels.
  return options.format === "gif"
    ? await joined.gif({ delay, loop: options.loop, reuse: false }).toBuffer()
    : await joined.webp({ delay, loop: options.loop }).toBuffer();
}
