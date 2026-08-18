/**
 * Decide how a tool's output travels to object storage.
 *
 * Node's fs.readFile refuses single reads at 2 GiB (ERR_FS_FILE_TOO_LARGE),
 * so buffering every scratchPath result crashed long video jobs after the
 * encode itself had succeeded (Sentry NODE-2Z). Anything over the cap stays
 * on disk and is streamed with putObjectStream; everything under it buffers
 * exactly as before, keeping previews, PDF scrubbing, and library auto-save
 * untouched for the sizes they actually serve.
 */

import { readFile, stat } from "node:fs/promises";

/** 1.5 GiB: safely under Node's 2 GiB single-read limit, with margin. */
export const MAX_BUFFERED_OUTPUT_BYTES = 1.5 * 1024 ** 3;

export type ResolvedOutput =
  | { kind: "buffer"; buffer: Buffer; size: number }
  | { kind: "stream"; scratchPath: string; size: number };

export async function resolveOutputSource(
  out: { buffer?: Buffer; scratchPath?: string },
  missingSourceMessage: string,
  opts: { maxBufferedBytes?: number } = {},
): Promise<ResolvedOutput> {
  if (out.buffer) {
    return { kind: "buffer", buffer: out.buffer, size: out.buffer.length };
  }
  if (out.scratchPath) {
    const size = (await stat(out.scratchPath)).size;
    if (size > (opts.maxBufferedBytes ?? MAX_BUFFERED_OUTPUT_BYTES)) {
      return { kind: "stream", scratchPath: out.scratchPath, size };
    }
    return { kind: "buffer", buffer: await readFile(out.scratchPath), size };
  }
  // The caller supplies its full historical message; integration tests and
  // logs pin these strings per call site.
  throw new Error(missingSourceMessage);
}
