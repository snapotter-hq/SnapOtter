import sharp from "sharp";
import type { ImageInfo } from "../types.js";

/**
 * Extract comprehensive image metadata from a buffer.
 */
export async function getImageInfo(buffer: Buffer): Promise<ImageInfo> {
  const metadata = await sharp(buffer).metadata();

  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format ?? "unknown",
    channels: metadata.channels ?? 0,
    size: buffer.length,
    hasAlpha: metadata.hasAlpha ?? false,
    metadata: {
      space: metadata.space,
      density: metadata.density,
      isProgressive: metadata.isProgressive,
      hasProfile: metadata.hasProfile,
      orientation: metadata.orientation,
      exif: metadata.exif ? true : false,
      icc: metadata.icc ? true : false,
      xmp: metadata.xmp ? true : false,
    },
  };
}
