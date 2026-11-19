import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioContentType, formatFfmpegSeconds, runMediaTool } from "../../lib/media-tool.js";
import { checkTrimMode, resolveTrimWindow, trimModeFields } from "../../lib/trim-window.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

// Stream copy cannot cut below one codec frame (mp3 ~26ms, flac up to ~93ms);
// smaller windows produce a container with zero audio frames.
const MIN_TRIM_WINDOW_S = 0.1;

const settingsSchema = z
  .object(trimModeFields)
  .superRefine((s, ctx) => checkTrimMode(s, ctx, MIN_TRIM_WINDOW_S));

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
        if (endS - startS < MIN_TRIM_WINDOW_S) {
          throw new InputValidationError(
            `Trim window is shorter than ${MIN_TRIM_WINDOW_S} seconds after resolving it against the audio duration`,
          );
        }
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
