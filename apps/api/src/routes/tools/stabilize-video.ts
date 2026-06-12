import { extname, join } from "node:path";
import { probeMedia, resolveEncoder, runFfmpeg } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  smoothing: z.number().int().min(5).max(60).default(15),
});

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

      // Pass 2: stabilization with re-encode
      ctx.report(50, "Stabilizing");
      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-i",
          inPath,
          "-vf",
          `vidstabtransform=input=${trf}:smoothing=${settings.smoothing}`,
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          "20",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "copy",
          outPath,
        ],
        info.durationS,
      );

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
