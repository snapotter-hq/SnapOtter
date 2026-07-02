import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { probeMedia, resolveEncoder, runFfmpeg } from "@snapotter/media-engine";
import type { ToolProcessCtxV2 } from "../routes/tool-factory.js";

const EXT_VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".3gp": "video/3gpp",
  ".flv": "video/x-flv",
  ".wmv": "video/x-ms-wmv",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".ts": "video/mp2t",
  ".mts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".ogv": "video/ogg",
};

/** Content type for a preserved-container video output; mp4 fallback. */
export function videoContentType(ext: string): string {
  return EXT_VIDEO_CONTENT_TYPES[ext.toLowerCase()] || "video/mp4";
}

/**
 * Video encode args valid for the given OUTPUT container extension.
 * WebM accepts only VP8/VP9/AV1, OGV only Theora; everything else
 * (mp4/mov/mkv/avi/ts) gets H.264. Hardcoding H.264 into a preserved
 * non-mp4 container is a real bug: ffmpeg cannot mux H.264 into WebM and
 * fails the header write ("Invalid argument", exit 234). Arg sets mirror
 * the tested convert-video encoders.
 */
export function videoEncodeArgsForContainer(ext: string): string[] {
  const lower = ext.toLowerCase();
  if (lower === ".mpg" || lower === ".mpeg") {
    return ["-c:v", "mpeg2video", "-q:v", "4", "-pix_fmt", "yuv420p"];
  }
  if (lower === ".webm") {
    return ["-c:v", resolveEncoder("vp9"), "-crf", "30", "-b:v", "0", "-row-mt", "1"];
  }
  if (lower === ".ogv" || lower === ".ogg") {
    // Theora has no HW-accel path; use libtheora directly.
    return ["-c:v", "libtheora", "-q:v", "7"];
  }
  return ["-c:v", resolveEncoder("h264"), "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p"];
}

/**
 * Audio encode args valid for the given OUTPUT container, for tools that
 * must (re-)encode the audio stream (tempo/reverse/loudnorm/replace).
 * WebM needs Opus, OGV needs Vorbis, everything else gets AAC. When the
 * source audio stream is untouched and the container is preserved, use
 * ["-c:a", "copy"] directly instead -- it is always valid there.
 */
export function audioEncodeArgsForContainer(ext: string): string[] {
  const lower = ext.toLowerCase();
  if (lower === ".mpg" || lower === ".mpeg") return ["-c:a", "mp2", "-b:a", "192k"];
  if (lower === ".webm") return ["-c:a", resolveEncoder("opus")];
  if (lower === ".ogv" || lower === ".ogg") return ["-c:a", "libvorbis"];
  return ["-c:a", resolveEncoder("aac")];
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

/** atempo only accepts 0.5..100; chain factors of 0.5 until in range. */
export function buildAtempoChain(factor: number): string {
  const parts: string[] = [];
  let f = factor;
  while (f < 0.5) {
    parts.push("atempo=0.5");
    f /= 0.5;
  }
  parts.push(`atempo=${f}`);
  return parts.join(",");
}

export interface AudioOutput {
  ext: string;
  contentType: string;
  encodeArgs: string[];
}

const AUDIO_OUTPUTS: Record<string, AudioOutput> = {
  ".mp3": {
    ext: ".mp3",
    contentType: "audio/mpeg",
    encodeArgs: ["-c:a", "libmp3lame", "-b:a", "192k"],
  },
  ".wav": { ext: ".wav", contentType: "audio/wav", encodeArgs: ["-c:a", "pcm_s16le"] },
  ".ogg": {
    ext: ".ogg",
    contentType: "audio/ogg",
    // Quality-based VBR, not a fixed bitrate: libvorbis fails with "encoder setup
    // failed" when a high fixed bitrate (192k) is requested for a low sample rate
    // (e.g. 8 kHz mono). -q:a 6 is ~192 kbps for normal audio and adapts to the rate.
    encodeArgs: ["-c:a", "libvorbis", "-q:a", "6"],
  },
  ".opus": {
    ext: ".opus",
    contentType: "audio/opus",
    encodeArgs: ["-c:a", "libopus", "-b:a", "128k"],
  },
  ".flac": { ext: ".flac", contentType: "audio/flac", encodeArgs: ["-c:a", "flac"] },
  ".m4a": { ext: ".m4a", contentType: "audio/mp4", encodeArgs: ["-c:a", "aac", "-b:a", "192k"] },
  ".aac": { ext: ".m4a", contentType: "audio/mp4", encodeArgs: ["-c:a", "aac", "-b:a", "192k"] },
  ".aiff": { ext: ".aiff", contentType: "audio/aiff", encodeArgs: ["-c:a", "pcm_s16be"] },
};

/**
 * Encoder selection for filtered (re-encoded) audio outputs, keyed by the
 * SOURCE extension. Decode-only sources (wma/amr/ape/...) fall back to mp3.
 */
export function audioOutputFor(srcExt: string): AudioOutput {
  return AUDIO_OUTPUTS[srcExt.toLowerCase()] ?? AUDIO_OUTPUTS[".mp3"];
}

export interface MediaRunResult {
  outPath: string;
  durationS: number | null;
}

/** Stages every ctx input into scratch (in-<i>-<sanitized>) and returns the paths. */
export async function stageMediaInputs(ctx: ToolProcessCtxV2): Promise<string[]> {
  const dir = join(ctx.scratchDir, "media");
  await mkdir(dir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < ctx.inputs.length; i++) {
    const safe = ctx.inputs[i].filename.replace(/[^A-Za-z0-9._-]/g, "_");
    const p = join(dir, `in-${i}-${safe}`);
    await writeFile(p, ctx.inputs[i].buffer);
    paths.push(p);
  }
  return paths;
}

/** Progress-mapped runFfmpeg (5..95%) against a known duration; 30 min default timeout. */
export async function runFfmpegWithProgress(
  ctx: ToolProcessCtxV2,
  args: string[],
  durationS: number | null,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  ctx.report(5, "Preparing");
  return runFfmpeg(args, {
    signal: ctx.signal,
    timeoutMs: opts.timeoutMs ?? 30 * 60_000,
    onProgress: (p) => {
      if (p.outTimeMs !== null && durationS) {
        const pct = Math.min(95, 5 + Math.round((p.outTimeMs / (durationS * 1000)) * 90));
        ctx.report(pct, "Processing");
      }
    },
  });
}

/**
 * Stages the primary input in the scratch dir, probes it, runs ffmpeg with
 * progress mapped onto ctx.report (5..95%), and returns the output path for
 * a scratchPath result. argsFor receives the staged input/output paths.
 */
export async function runMediaTool(
  ctx: ToolProcessCtxV2,
  outName: string,
  argsFor: (
    inPath: string,
    outPath: string,
    info: { durationS: number | null; audioSampleRate: number | null },
  ) => string[],
  opts: { timeoutMs?: number } = {},
): Promise<MediaRunResult> {
  const dir = join(ctx.scratchDir, "media");
  await mkdir(dir, { recursive: true });
  const inPath = join(dir, `in-${ctx.inputs[0].filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
  await writeFile(inPath, ctx.inputs[0].buffer);
  const info = await probeMedia(inPath);
  const outPath = join(dir, outName);
  await runFfmpegWithProgress(
    ctx,
    argsFor(inPath, outPath, {
      durationS: info.durationS,
      audioSampleRate: info.streams.find((s) => s.type === "audio")?.sampleRate ?? null,
    }),
    info.durationS,
    opts,
  );
  return { outPath, durationS: info.durationS };
}
