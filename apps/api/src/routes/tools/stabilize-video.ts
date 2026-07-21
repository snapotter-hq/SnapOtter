import { extname, join } from "node:path";
import { type EncoderTarget, probeMedia, resolveEncoder, runFfmpeg } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  smoothing: z.number().int().min(5).max(60).default(15),
});

/**
 * Choose a codec that is valid for the given container extension.
 * webm requires VP9 (or VP8/AV1); ogv requires Theora; everything
 * else gets H.264 (mp4/mov/mkv/avi/ts).
 */
function codecForContainer(ext: string): {
  target: EncoderTarget;
  encodeArgs: string[];
} {
  const lower = ext.toLowerCase();
  if (lower === ".webm") {
    return {
      target: "vp9",
      encodeArgs: ["-c:v", resolveEncoder("vp9"), "-crf", "30", "-b:v", "0", "-row-mt", "1"],
    };
  }
  if (lower === ".ogv" || lower === ".ogg") {
    // Theora has no HW-accel path; use libtheora directly.
    return {
      target: "h264", // unused, just for the type
      encodeArgs: ["-c:v", "libtheora", "-q:v", "7"],
    };
  }
  return {
    target: "h264",
    encodeArgs: [
      "-c:v",
      resolveEncoder("h264"),
      "-crf",
      "20",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
    ],
  };
}

/**
 * mp4/mov muxers write the moov atom at the end of the file by default. A
 * progressive player (browsers, the in-app player, most mobile players) then
 * cannot start playback or seek until the whole file is downloaded, so the
 * stabilized result looks broken or "corrupted" on preview. +faststart moves
 * the moov atom to the front. Mirrors convert-video / compress-video (#588).
 */
function faststartArgs(ext: string): string[] {
  const lower = ext.toLowerCase();
  return lower === ".mp4" || lower === ".m4v" || lower === ".mov"
    ? ["-movflags", "+faststart"]
    : [];
}

export function registerStabilizeVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "stabilize-video",
    settingsSchema,
    process: async () => {
      throw new Error("stabilize-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_stabilized${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const trf = join(ctx.scratchDir, "media", "stab.trf");
      const nullOut = join(ctx.scratchDir, "media", "null.out");

      // Pass 1: motion analysis (no progress mapping; stdout carries -progress pipe:1)
      ctx.report(5, "Analyzing");
      await runFfmpeg(
        ["-i", inPath, "-an", "-vf", `vidstabdetect=result=${trf}`, "-f", "null", nullOut],
        {
          signal: ctx.signal,
          timeoutMs: 30 * 60_000,
        },
      );

      // Pass 2: stabilization with re-encode using a container-appropriate codec.
      ctx.report(50, "Stabilizing");
      const outPath = join(ctx.scratchDir, "media", outName);
      const { encodeArgs } = codecForContainer(origExt);

      // Audio: webm/ogv need Opus/Vorbis; for other containers just copy.
      const audioArgs =
        origExt.toLowerCase() === ".webm"
          ? ["-c:a", resolveEncoder("opus")]
          : origExt.toLowerCase() === ".ogv" || origExt.toLowerCase() === ".ogg"
            ? ["-c:a", "libvorbis"]
            : ["-c:a", "copy"];

      await runFfmpegWithProgress(
        ctx,
        [
          "-i",
          inPath,
          "-vf",
          `vidstabtransform=input=${trf}:smoothing=${settings.smoothing}`,
          ...encodeArgs,
          ...audioArgs,
          ...faststartArgs(origExt),
          outPath,
        ],
        info.durationS,
      );

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
