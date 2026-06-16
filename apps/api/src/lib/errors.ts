import type { ZodIssue } from "zod";

export function formatZodErrors(issues: ZodIssue[]): string {
  return issues
    .map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message))
    .join("; ");
}

/**
 * Strip internal filesystem paths from error messages to avoid
 * leaking server directory structure to API consumers.
 */
export function stripInternalPaths(message: string): string {
  return message.replace(/\/(tmp|data|app|opt|home|workspace)\b[^\s'")}]*/g, "[internal]");
}

/**
 * Unambiguous markers of a raw external-tool failure dump: the
 * `ffmpeg/ffprobe exited N:` prefix that media-engine throws, a Python
 * traceback, or a crash. These are matched precisely (not by content
 * keywords like "pixel format" or "conversion failed", which can appear in
 * legitimate validation messages) -- longer or multi-line raw dumps are
 * caught separately by the length/line-count check below.
 */
const RAW_TOOL_FAILURE =
  /ff(?:mpeg|probe) exited \d|traceback \(most recent call|segmentation fault|core dumped/i;

/**
 * Produce a user-safe error detail. Intentional validation messages (short,
 * single-line) pass through unchanged after path scrubbing; raw tool-runner
 * dumps collapse to one generic sentence. The full error is still recorded in
 * server logs and telemetry by the caller -- only the client-facing string is
 * sanitized. Idempotent, so it is safe to apply at every error surface.
 */
export function friendlyError(message: string): string {
  const cleaned = stripInternalPaths(message);
  if (RAW_TOOL_FAILURE.test(cleaned) || cleaned.length > 280 || cleaned.split("\n").length > 3) {
    return "Processing failed. The file may be in an unsupported or corrupted format.";
  }
  return cleaned;
}
