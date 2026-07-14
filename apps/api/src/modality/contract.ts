/**
 * Shared types for modality input handlers. Lives in its own file to
 * break the import cycle between input-handler.ts (registry) and the
 * per-modality implementations that reference these types.
 */

export class InputValidationError extends Error {
  statusCode: number;
  details?: string;
  constructor(message: string, statusCode = 400, details?: string) {
    super(message);
    this.name = "InputValidationError";
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
  }
}

export interface PreparedInput {
  buffer: Buffer;
  filename: string;
}

/**
 * Modality-specific upload validation/normalization (spec 4.5). Throws
 * InputValidationError (400) on rejection. The factory owns storage and
 * enqueueing; handlers own format logic only.
 */
export interface InputHandler {
  prepare(
    raw: Buffer,
    filename: string,
    opts: {
      scratchDir: string;
      /**
       * When true, skip structural validation (qpdfCheck, page caps) but
       * keep header-magic checks. Used by tools that intentionally accept
       * damaged inputs (e.g. repair-pdf).
       */
      lenient?: boolean;
      /** Reject encrypted PDFs when the consuming tool has no password input. */
      rejectPasswordProtected?: boolean;
      /** Reject images whose decoded dimensions exceed this pixel count. */
      maxPixels?: number;
      /** Reject images whose decoded width or height exceeds this side length. */
      maxDimension?: number;
      /** Abort validation, external decoders, and normalization with the job. */
      signal?: AbortSignal;
    },
  ): Promise<PreparedInput>;
}
