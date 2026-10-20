import sharp from "sharp";
import { apngFrameCount } from "./apng.js";

export interface AnimationInfo {
  animated: boolean;
  frames: number;
}

/**
 * Detect whether an uploaded image is a multi-frame animation and count frames.
 *
 * Format-routed because Sharp/libvips is blind to APNG: GIF and animated WebP
 * expose `metadata().pages`, but PNG/APNG must be read via the `acTL` chunk
 * (`apngFrameCount`). Used by the remove-gif-background route to reject stills
 * and enforce the frame cap before enqueuing.
 */
export async function detectAnimation(buf: Buffer, _filename?: string): Promise<AnimationInfo> {
  const apngFrames = apngFrameCount(buf);
  if (apngFrames !== null) {
    return { animated: apngFrames > 1, frames: apngFrames };
  }
  const meta = await sharp(buf, { animated: true }).metadata();
  if (meta.format !== "gif" && meta.format !== "webp") {
    return { animated: false, frames: 1 };
  }
  const pages = meta.pages ?? 1;
  return { animated: pages > 1, frames: pages };
}
