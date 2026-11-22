import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioContentType, formatFfmpegSeconds, runMediaTool } from "../../lib/media-tool.js";
import { checkTrimMode, resolveTrimWindow, trimModeFields } from "../../lib/trim-window.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object(trimModeFields).superRefine((s, ctx) => checkTrimMode(s, ctx));

export function registerTrimAudio(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "trim-audio",
    settingsSchema,
    process: async () => {
      throw new Error("trim-audio is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_trimmed${origExt}`;
      const contentType = audioContentType(origExt);

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out, info) => {
        if (info.durationS === null) {
          throw new InputValidationError("Could not determine audio duration");
        }
        const { startS, endS } = resolveTrimWindow(settings, info.durationS, "audio");
        // Fast seek with stream-copy for audio
        return [
          "-ss",
          formatFfmpegSeconds(startS),
          "-to",
          formatFfmpegSeconds(endS),
          "-i",
          inPath,
          "-c",
          "copy",
          out,
        ];
      });
      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
