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
  return message.replace(
    /\/(?:tmp|data|app|opt|home|workspace)\b[^\s'")}]*|[A-Za-z]:\\[^\s'")}]*/g,
    "[internal]",
  );
}

// Matching control characters is the entire point of these patterns (we strip
// them), so noControlCharactersInRegex's premise doesn't apply. ANSI_CSI =
// ESC [ ... final-byte (color/cursor/spinner); C0_CONTROLS = the C0 range + DEL,
// excluding tab (\x09) and newline (\x0A), which we keep.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matches control chars to strip them
const ANSI_CSI = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matches control chars to strip them
const C0_CONTROLS = /[\x00-\x08\x0B-\x1F\x7F]/g;

/**
 * Strip ANSI escape sequences and other terminal control characters that
 * subprocess CLIs (e.g. caire's progress spinner) emit into their stderr, so a
 * surfaced tool-failure message is plain text rather than raw terminal garbage.
 * Preserves tab and newline.
 */
export function stripControlChars(message: string): string {
  return message.replace(ANSI_CSI, "").replace(C0_CONTROLS, "");
}

/**
 * Unambiguous markers of a raw external-tool failure dump: the
 * `ffmpeg/ffprobe exited N:` prefix that media-engine throws, a Python
 * traceback, or a crash. Matched precisely (not by content keywords like
 * "pixel format" or "conversion failed", which appear in legitimate validation
 * messages); longer or multi-line raw dumps are caught by the length/line-count
 * check below.
 *
 * Doc-engine tools (qpdf, gs, pdfcpu, pandoc, LibreOffice) are deliberately NOT
 * matched here. Their short stderr is already path-scrubbed and often carries
 * the actionable reason (qpdf surfaces "invalid password" this way), so
 * collapsing it to the generic sentence would hide errors users need. The
 * genuinely verbose dumps are still caught by the length/line-count guard.
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
  const cleaned = stripInternalPaths(stripControlChars(message));
  if (RAW_TOOL_FAILURE.test(cleaned) || cleaned.length > 280 || cleaned.split("\n").length > 3) {
    return "Processing failed. The file may be in an unsupported or corrupted format.";
  }
  return cleaned;
}
