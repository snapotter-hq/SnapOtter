import { dirname, join } from "node:path";
import { probeMedia, resolveEncoder, resolveFontFile } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  fontSize: z.number().int().min(8).max(72).default(24),
});

export function registerBurnSubtitles(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "burn-subtitles",
    maxInputs: 2,
    inputKinds: ["video", "subtitle"],
    settingsSchema,
    process: async () => {
      throw new Error("burn-subtitles is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length !== 2) {
        throw new InputValidationError("Provide a video file and a subtitle file");
      }

      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_subtitled.mp4`;

      const font = resolveFontFile();
      if (!font) {
        throw new Error("No usable font found for subtitles (set SNAPOTTER_FONT_FILE)");
      }

      const paths = await stageMediaInputs(ctx);
      const videoPath = paths[0];
      const subPath = paths[1];
      const info = await probeMedia(videoPath);

      const vf = `subtitles=${subPath}:fontsdir=${dirname(font.file)}:force_style='FontName=${font.family},FontSize=${settings.fontSize}'`;

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-i",
          videoPath,
          "-vf",
          vf,
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

      return {
        scratchPath: outPath,
        filename: outName,
        contentType: "video/mp4",
      };
    },
  });
}
