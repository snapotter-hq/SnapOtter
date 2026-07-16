import { isSafeMessageError, isToolInputError, SafeError } from "@snapotter/shared";
import type { ToolProcessCtx } from "../routes/tool-factory.js";

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
