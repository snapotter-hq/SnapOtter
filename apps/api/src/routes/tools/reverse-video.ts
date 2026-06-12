import { extname, join } from "node:path";
import { probeMedia, resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerReverseVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "reverse-video",
    settingsSchema,
    process: async () => {
      throw new Error("reverse-video is v2-only");
    },
    processV2: async (ctx) => {
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_reversed${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);

      if ((info.durationS ?? 0) > 300) {
        throw new InputValidationError("Reverse is limited to clips up to 5 minutes");
      }

      const hasAudio = info.streams.some((s) => s.type === "audio");
      const outPath = join(ctx.scratchDir, "media", outName);

      let args: string[];

      if (hasAudio) {
        args = [
          "-i",
          inPath,
          "-vf",
          "reverse",
          "-af",
          "areverse",
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
          outPath,
        ];
      } else {
        args = [
          "-i",
          inPath,
          "-vf",
          "reverse",
          "-an",
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          "20",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          outPath,
        ];
      }

      await runFfmpegWithProgress(ctx, args, info.durationS);

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
