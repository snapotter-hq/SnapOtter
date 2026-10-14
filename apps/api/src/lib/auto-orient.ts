import type { FastifyBaseLogger } from "fastify";
import sharp, { type Metadata, type Sharp } from "sharp";
import { assertGifWorkload } from "./gif-limits.js";
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
function isLosslessWebP(buffer: Buffer): boolean {
  if (buffer.length < 16 || buffer.toString("ascii", 0, 4) !== "RIFF") return false;

  let sawLosslessFrame = false;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    if (chunkType === "VP8L") return true;
    if (chunkType === "VP8 ") return false;
    const chunkLength = buffer.readUInt32LE(offset + 4);
    if (chunkType === "ANMF") {
      const frameEnd = Math.min(buffer.length, offset + 8 + chunkLength);
      let subOffset = offset + 24;
      while (subOffset + 8 <= frameEnd) {
        const subType = buffer.toString("ascii", subOffset, subOffset + 4);
        if (subType === "VP8 ") return false;
        if (subType === "VP8L") sawLosslessFrame = true;
        const subLength = buffer.readUInt32LE(subOffset + 4);
        subOffset += 8 + subLength + (subLength % 2);
      }
    }
    offset += 8 + chunkLength + (chunkLength % 2);
  }
  return sawLosslessFrame;
}

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
    const encoderOptions: Record<string, unknown> = { ...output.encoderOptions };

    if (output.format === "webp" && isLosslessWebP(buffer)) {
      encoderOptions.lossless = true;
    } else if (output.format === "tiff") {
      encoderOptions.compression = meta.compression || "lzw";
    }

    const pages = meta.pages ?? 1;
    let pipeline: Sharp;
    if (pages > 1 && (output.format === "webp" || output.format === "gif")) {
      assertGifWorkload(
        { width: meta.width, height: meta.height, pages },
        output.format === "webp" ? "Animated WebP input" : "GIF input",
      );
      // Sharp refuses to rotate multi-page images for 90/270 degree turns, and
      // rotating a stacked strip 180 degrees or flipping it vertically reverses
      // the frame order (#1260). Rotate each frame individually and rejoin.
      const frames: Buffer[] = [];
      for (let page = 0; page < pages; page++) {
        frames.push(await sharp(buffer, { page, pages: 1 }).rotate().png().toBuffer());
      }
      pipeline = sharp(frames, { join: { across: 1, animated: true } });
      if (meta.delay !== undefined) encoderOptions.delay = meta.delay;
      if (meta.loop !== undefined) encoderOptions.loop = meta.loop;
    } else {
      pipeline = sharp(buffer).rotate();
      if (meta.depth === "ushort" && meta.space) {
        pipeline = pipeline.toColorspace(meta.space);
      }
    }

    return await pipeline.toFormat(output.format, encoderOptions).toBuffer();
  } catch (err) {
    // The tool's own decode of the same buffer is expected to reject it. A warn
    // here with no failed-job line after it points at an encode-side bug.
    log.warn(
      {
        err,
        orientation: meta.orientation,
        format: meta.format,
        pages: meta.pages,
        bytes: buffer.length,
      },
      "autoOrient: rotation failed, passing image through unrotated",
    );
    return buffer;
  }
}
