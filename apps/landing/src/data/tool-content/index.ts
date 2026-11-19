import { compressPdf } from "./compress-pdf.js";
import { extractSubtitles } from "./extract-subtitles.js";
import { ocrPdf } from "./ocr-pdf.js";
import { resize } from "./resize.js";
import { reverseVideo } from "./reverse-video.js";
import { ringtoneMaker } from "./ringtone-maker.js";
import { smartCrop } from "./smart-crop.js";
import { transcribeAudio } from "./transcribe-audio.js";
import type { ToolContent } from "./types.js";

export type { AlternativesNote, SampleSource, ToolContent, ToolRun } from "./types.js";

const ALL: readonly ToolContent[] = [
  ringtoneMaker,
  smartCrop,
  resize,
  compressPdf,
  extractSubtitles,
  reverseVideo,
  ocrPdf,
  transcribeAudio,
];

/** First-hand content keyed by tool id. A tool without an entry renders the generic page. */
export const TOOL_CONTENT: Readonly<Record<string, ToolContent>> = Object.fromEntries(
  ALL.map((c) => [c.toolId, c]),
);

/** Decimal units, matching what file managers and the compress tools report. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} bytes`;
}

/**
 * Output size relative to input, e.g. "-89%" or "+26%". Extractions shrink a file
 * to a sliver of its input, where a rounded "-100%" would read as an empty file.
 */
export function sizeChange(inputBytes: number, outputBytes: number): string {
  if (outputBytes / inputBytes < 0.01) return "under 1% of input";
  const pct = Math.round((outputBytes / inputBytes - 1) * 100);
  if (pct === 0) return "same size";
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}
