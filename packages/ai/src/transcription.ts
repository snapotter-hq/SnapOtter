import {
  type ProgressCallback,
  parseStdoutJson,
  runPythonWithProgress,
  toSidecarError,
} from "./bridge.js";

/**
 * A single timed segment of transcribed speech.
 * Defined locally (packages/ai cannot depend on apps/api);
 * the route layer adapts to the api-side TranscriptSegment shape.
 */
export interface TranscriptSegment {
  startS: number;
  endS: number;
  text: string;
}

export interface TranscriptionResult {
  language: string;
  text: string;
  segments: TranscriptSegment[];
}

export interface TranscribeOptions {
  language: string;
}

export async function transcribeAudio(
  inputPath: string,
  opts: TranscribeOptions,
  onProgress?: ProgressCallback,
): Promise<TranscriptionResult> {
  const optionsJson = JSON.stringify({
    language: opts.language,
    task: "transcribe",
  });

  const { stdout } = await runPythonWithProgress("transcribe.py", [inputPath, optionsJson], {
    timeout: 30 * 60_000,
    onProgress,
  });

  const result = parseStdoutJson(stdout);
  if (result.error) {
    throw toSidecarError(result.error, "Transcription failed");
  }

  // Map python segment keys {start, end, text} to {startS, endS, text}.
  // Defensive: if segments is missing or not an array, default to [].
  const rawSegments: Array<{ start?: number; end?: number; text?: string }> = Array.isArray(
    result.segments,
  )
    ? result.segments
    : [];

  const segments: TranscriptSegment[] = rawSegments.map((seg) => ({
    startS: seg.start ?? 0,
    endS: seg.end ?? 0,
    text: (seg.text ?? "").trim(),
  }));

  return {
    language: result.language ?? "en",
    text: result.text ?? "",
    segments,
  };
}
