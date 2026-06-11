import sharp from "sharp";
import { autoOrient } from "../lib/auto-orient.js";
import { stripInternalPaths } from "../lib/errors.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { decodeAnyFormat, decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { decompressSvgz, sanitizeSvg } from "../lib/svg-sanitize.js";
import { type InputHandler, InputValidationError, type PreparedInput } from "./contract.js";

/**
 * Image input handler: validateImageBuffer, HEIC decode, CLI decode,
 * SVG sanitize, AVIF probe fallback, autoOrient. Extracted verbatim
 * from the tool-factory validation/decode chain.
 */
export class ImageInputHandler implements InputHandler {
  async prepare(
    raw: Buffer,
    originalFilename: string,
    _opts: { scratchDir: string },
  ): Promise<PreparedInput> {
    let fileBuffer = raw;
    let name = originalFilename;

    // Validate the uploaded image
    const validation = await validateImageBuffer(fileBuffer, name);
    if (!validation.valid) {
      throw new InputValidationError(`Invalid image: ${validation.reason}`);
    }

    // Decode HEIC/HEIF input via system heif-dec (Sharp's bundled libheif
    // lacks the HEVC decoder needed for iPhone photos).
    // The decoded buffer is PNG, so update the filename extension to match.
    const isHeif = validation.format === "heif";
    if (isHeif) {
      try {
        fileBuffer = await decodeHeic(fileBuffer);
        const ext = name.match(/\.[^.]+$/)?.[0];
        if (ext) name = `${name.slice(0, -ext.length)}.png`;
      } catch (err) {
        throw new InputValidationError(
          "Failed to decode HEIC file. Ensure libheif-examples is installed.",
          422,
          stripInternalPaths(err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // Decode CLI-decoded formats (RAW, PSD, TGA, EXR, HDR) via external tools.
    // The decoded buffer is PNG, so update the filename extension to match.
    // Pass the original file extension so RAW decoder can use the correct
    // temp file suffix (e.g. .cr3, .nef) for format identification.
    if (needsCliDecode(validation.format)) {
      try {
        const fileExt = name.split(".").pop()?.toLowerCase();
        fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format, fileExt);
      } catch {
        try {
          await sharp(fileBuffer).metadata();
        } catch (err) {
          throw new InputValidationError(
            `Failed to decode ${validation.format.toUpperCase()} file`,
            422,
            stripInternalPaths(err instanceof Error ? err.message : String(err)),
          );
        }
      }
      const ext = name.match(/\.[^.]+$/)?.[0];
      if (ext) name = `${name.slice(0, -ext.length)}.png`;
    }

    // Sanitize SVG input to prevent XXE, SSRF, and script injection
    const isSvg = validation.format === "svg";
    if (isSvg) {
      try {
        fileBuffer = decompressSvgz(fileBuffer);
        fileBuffer = sanitizeSvg(fileBuffer);
      } catch (err) {
        throw new InputValidationError(err instanceof Error ? err.message : "Invalid SVG");
      }
    }

    // AVIF can pass metadata validation but fail pixel decode when
    // Sharp's bundled libheif lacks support for the bitstream version.
    // A 1x1 resize forces a minimal pixel decode to catch this early.
    if (validation.format === "avif") {
      try {
        await sharp(fileBuffer).resize(1).raw().toBuffer();
      } catch {
        try {
          fileBuffer = await decodeAnyFormat(fileBuffer, "avif");
          const ext = name.match(/\.[^.]+$/)?.[0];
          if (ext) name = `${name.slice(0, -ext.length)}.png`;
        } catch (fallbackErr) {
          throw new InputValidationError(
            "Failed to decode AVIF file",
            422,
            stripInternalPaths(
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            ),
          );
        }
      }
    }

    // Auto-orient non-SVG images: physically rotate pixels to match
    // the EXIF orientation tag so the worker sees upright pixels.
    if (!isSvg) {
      fileBuffer = await autoOrient(fileBuffer);
    }

    return {
      buffer: fileBuffer,
      filename: name,
    };
  }
}
