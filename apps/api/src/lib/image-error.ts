import { isSafeMessageError, isToolInputError, SafeError, ToolInputError } from "@snapotter/shared";
import sharp from "sharp";
import type { ToolProcessCtx } from "../routes/tool-factory.js";

/** Single line under 280 chars so friendlyError() passes it to the client verbatim. */
export const UNDECODABLE_IMAGE_MESSAGE =
  "This image can't be decoded. The file may be corrupt or use an unsupported encoding.";

type ImageProcess<T> = (
  inputBuffer: Buffer,
  settings: T,
  filename: string,
  ctx?: ToolProcessCtx,
) => Promise<{ buffer: Buffer; filename: string; contentType: string }>;

/**
 * Wrap an image tool's process function so an otherwise-opaque failure (most
 * often a Sharp `.toBuffer()` that throws an empty-message Error) surfaces a
 * safe, authored title instead of "Error: Error".
 *
 * The API's Sentry scrubber replaces any non-SafeError message with a type-only
 * value (see `rebuildErrorValue`), so a bare Sharp failure is undiagnosable.
 * Re-throwing as a SafeError makes the title survive while the original error is
 * kept as `cause`, preserving its stack and exact location. Errors we already
 * author (SafeError) or that flag bad user input (ToolInputError) pass through
 * untouched so their class is not masked.
 */
/**
 * Decide whether a Sharp failure was caused by undecodable input (the user's
 * problem) or by our processing (our bug), and return the error to throw.
 *
 * Image intake only validates via metadata(), which parses headers without
 * touching pixel data, so a structurally-valid-but-undecodable file (truncated
 * scan data, broken IDAT) reaches the worker and blows up on the first full
 * decode (#897). Probing a minimal 1x1 decode of the original input, the same
 * probe image-input.ts uses for AVIF, classifies behaviorally: if the probe
 * also fails, the pixels can't be decoded and the failure becomes a
 * ToolInputError ("expected": no error log, no Sentry). If the probe passes,
 * the input was fine and the original error is returned so the caller's
 * withImageEncodeContext wrapper classifies it as a bug with a real title.
 */
export async function asInputErrorIfUndecodable(inputBuffer: Buffer, err: unknown): Promise<Error> {
  const alreadyClassified =
    isSafeMessageError(err) ||
    isToolInputError(err) ||
    (err instanceof Error && err.name === "InputValidationError");
  if (alreadyClassified) return err as Error;

  try {
    await sharp(inputBuffer).resize(1).raw().toBuffer();
  } catch {
    return new ToolInputError(UNDECODABLE_IMAGE_MESSAGE);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export function withImageEncodeContext<T>(
  message: string,
  codeOf: (settings: T) => string,
  process: ImageProcess<T>,
): ImageProcess<T> {
  return async (inputBuffer, settings, filename, ctx) => {
    try {
      return await process(inputBuffer, settings, filename, ctx);
    } catch (err) {
      if (isSafeMessageError(err) || isToolInputError(err)) throw err;
      throw new SafeError(message, {
        kind: "bug",
        code: codeOf(settings),
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  };
}
