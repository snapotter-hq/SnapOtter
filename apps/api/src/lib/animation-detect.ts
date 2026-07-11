import { extname } from "node:path";
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
export async function detectAnimation(buf: Buffer, filename: string): Promise<AnimationInfo> {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png" || ext === ".apng") {
    const n = apngFrameCount(buf) ?? 1;
    return { animated: n > 1, frames: n };
  }
  const meta = await sharp(buf, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  return { animated: pages > 1, frames: pages };
}
