import { join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  startS: z.number().min(0).default(0),
  durationS: z.number().min(1).max(30).default(30),
});

export function registerRingtoneMaker(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "ringtone-maker",
    settingsSchema,
    process: async () => {
      throw new Error("ringtone-maker is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.m4r`;

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);

      if (settings.startS >= (info.durationS ?? Infinity)) {
        throw new InputValidationError("Start is beyond the end of the audio");
      }

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-ss",
          String(settings.startS),
          "-t",
          String(settings.durationS),
          "-i",
          inPath,
          "-vn",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-f",
          "ipod",
          outPath,
        ],
        info.durationS,
      );

      return { scratchPath: outPath, filename: outName, contentType: "audio/mp4" };
    },
  });
}
