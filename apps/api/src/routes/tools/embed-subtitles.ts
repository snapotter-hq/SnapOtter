import { basename, extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  language: z
    .string()
    .regex(/^[a-z]{3}$/)
    .default("eng"),
});

export function registerEmbedSubtitles(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "embed-subtitles",
    maxInputs: 2,
    inputKinds: ["video", "subtitle"],
    settingsSchema,
    process: async () => {
      throw new Error("embed-subtitles is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length !== 2) {
        throw new InputValidationError("Provide a video file and a subtitle file");
      }

      const settings = settingsSchema.parse(ctx.settings);
      const base = basename(ctx.inputs[0].filename, extname(ctx.inputs[0].filename));

      const srcExt = extname(ctx.inputs[0].filename).toLowerCase();
      const toMp4 = [".mp4", ".mov", ".m4v"].includes(srcExt);
      const outExt = toMp4 ? ".mp4" : ".mkv";
      const scodec = toMp4 ? "mov_text" : "srt";

      const outName = `${base}_subs${outExt}`;
      const contentType = videoContentType(outExt);

      const paths = await stageMediaInputs(ctx);
      const videoPath = paths[0];
      const subPath = paths[1];
      const info = await probeMedia(videoPath);

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-i",
          videoPath,
          "-i",
          subPath,
          "-map",
          "0",
          "-map",
          "1:0",
          "-c",
          "copy",
          "-c:s",
          scodec,
          "-metadata:s:s:0",
          `language=${settings.language}`,
          outPath,
        ],
        info.durationS,
      );

      return {
        scratchPath: outPath,
        filename: outName,
        contentType,
      };
    },
  });
}
