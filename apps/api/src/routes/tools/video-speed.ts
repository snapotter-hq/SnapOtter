import { extname, join } from "node:path";
import { probeMedia, resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  factor: z.number().min(0.25).max(4).default(2),
  keepPitch: z.boolean().default(true),
});

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

export function registerVideoSpeed(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-speed",
    settingsSchema,
    process: async () => {
      throw new Error("video-speed is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_speed${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const hasAudio = info.streams.some((s) => s.type === "audio");

      let args: string[];

      if (hasAudio) {
        const audioStream = info.streams.find((s) => s.type === "audio");
        const sr = audioStream?.sampleRate ?? 48000;
        let audioChain: string;
        if (settings.keepPitch) {
          audioChain = buildAtempoChain(settings.factor);
        } else {
          audioChain = `asetrate=${sr}*${settings.factor},aresample=${sr}`;
        }

        args = [
          "-i",
          inPath,
          "-filter_complex",
          `[0:v]setpts=PTS/${settings.factor}[v];[0:a]${audioChain}[a]`,
          "-map",
          "[v]",
          "-map",
          "[a]",
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          "20",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          resolveEncoder("aac"),
        ];
      } else {
        args = [
          "-i",
          inPath,
          "-vf",
          `setpts=PTS/${settings.factor}`,
          "-an",
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          "20",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
        ];
      }

      const outPath = join(ctx.scratchDir, "media", outName);
      args.push(outPath);

      await runFfmpegWithProgress(ctx, args, info.durationS);

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
