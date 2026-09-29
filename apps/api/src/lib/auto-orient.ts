import type { FastifyBaseLogger } from "fastify";
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
 * Returns the original buffer unchanged if no rotation is needed. Also passes
 * the buffer through, with a warn log, when its metadata can't be read or the
 * rotation itself fails, so a sideways result is traceable.
 *
 * Pass the request logger (or a child carrying jobId and toolId) where one is
 * in scope, so those warn lines can be joined to the upload that produced a
 * sideways result (#1417). Without it they go to the process logger, which
 * carries only trace ids, and only when OpenTelemetry is active.
 */
export async function autoOrient(
  buffer: Buffer,
  log: Pick<FastifyBaseLogger, "warn"> = logger,
): Promise<Buffer> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch (err) {
    // Callers validate the upload as an image before this runs, so an
    // unreadable header here is either a format only the tool's own decoder
    // handles or a transient failure on a valid file. Passing it through is
    // right in both cases (the tool's own decode is the arbiter), but the
    // second would otherwise be a silent sideways result.
    log.warn(
      { err, bytes: buffer.length },
      "autoOrient: could not read image metadata, passing image through unrotated",
    );
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
    // The tool's own decode of the same buffer is expected to reject it. A warn
    // here with no failed-job line after it points at an encode-side bug.
    log.warn(
      { err, orientation: meta.orientation, format: meta.format, bytes: buffer.length },
      "autoOrient: rotation failed, passing image through unrotated",
    );
    return buffer;
  }
}
