import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeMedia, runFfmpeg } from "@snapotter/media-engine";
import type { ToolProcessCtxV2 } from "../routes/tool-factory.js";

const EXT_VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

/** Content type for a preserved-container video output; mp4 fallback. */
export function videoContentType(ext: string): string {
  return EXT_VIDEO_CONTENT_TYPES[ext.toLowerCase()] || "video/mp4";
}

const EXT_AUDIO_CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
  ".wma": "audio/x-ms-wma",
  ".aiff": "audio/aiff",
};

/** Content type for a preserved-container audio output; mpeg fallback. */
export function audioContentType(ext: string): string {
  return EXT_AUDIO_CONTENT_TYPES[ext.toLowerCase()] || "audio/mpeg";
}

export interface MediaRunResult {
  outPath: string;
  durationS: number | null;
}

/**
 * Stages the primary input in the scratch dir, probes it, runs ffmpeg with
 * progress mapped onto ctx.report (5..95%), and returns the output path for
 * a scratchPath result. argsFor receives the staged input/output paths.
 */
export async function runMediaTool(
  ctx: ToolProcessCtxV2,
  outName: string,
  argsFor: (inPath: string, outPath: string, info: { durationS: number | null }) => string[],
  opts: { timeoutMs?: number } = {},
): Promise<MediaRunResult> {
  const dir = join(ctx.scratchDir, "media");
  await mkdir(dir, { recursive: true });
  const inPath = join(dir, `in-${ctx.inputs[0].filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
  await writeFile(inPath, ctx.inputs[0].buffer);
  const info = await probeMedia(inPath);
  const outPath = join(dir, outName);
  ctx.report(5, "Preparing");
  await runFfmpeg(argsFor(inPath, outPath, { durationS: info.durationS }), {
    signal: ctx.signal,
    timeoutMs: opts.timeoutMs ?? 30 * 60_000,
    onProgress: (p) => {
      if (p.outTimeMs !== null && info.durationS) {
        const pct = Math.min(95, 5 + Math.round((p.outTimeMs / (info.durationS * 1000)) * 90));
        ctx.report(pct, "Processing");
      }
    },
  });
  return { outPath, durationS: info.durationS };
}
