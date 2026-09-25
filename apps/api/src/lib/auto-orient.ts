import sharp, { type Metadata } from "sharp";
import { logger } from "./logger.js";
import { resolveOutputFormat } from "./output-format.js";

/**
 * Auto-orient an image buffer based on EXIF orientation metadata.
 *
 * Camera photos embed an EXIF Orientation tag (values 2-8) that viewers
 * respect when displaying. Sharp strips this tag during processing but
 * does NOT auto-rotate the pixels, so the output appears rotated.
 *
 * This function physically rotates the pixels to match the EXIF orientation,
 * then strips the tag so downstream processing produces correct results.
 *
 * Returns the original buffer unchanged if no rotation is needed.
 */
export async function autoOrient(buffer: Buffer): Promise<Buffer> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    // If metadata reading fails, return the original buffer
    return buffer;
  }
  if (!meta.orientation || meta.orientation <= 1) return buffer;

  try {
    // Re-encode in the container the image arrived in, at the quality the
    // rest of the pipeline uses. A bare toBuffer() would let Sharp pick both,
    // which for a JPEG means a second lossy generation at the encoder's
    // default (~80) before any tool the user asked for has run.
    const output = await resolveOutputFormat(buffer, "");
    return await sharp(buffer).rotate().toFormat(output.format, output.encoderOptions).toBuffer();
  } catch (err) {
    logger.warn(
      { err, orientation: meta.orientation, format: meta.format },
      "autoOrient: rotation failed, passing image through unrotated",
    );
    return buffer;
  }
}
