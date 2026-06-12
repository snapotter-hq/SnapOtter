import { join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerExtractSubtitles(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "extract-subtitles",
    settingsSchema,
    process: async () => {
      throw new Error("extract-subtitles is v2-only");
    },
    processV2: async (ctx) => {
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.srt`;

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);

      const outPath = join(ctx.scratchDir, "media", outName);

      try {
        await runFfmpegWithProgress(ctx, ["-i", inPath, "-map", "0:s:0", outPath], info.durationS);
      } catch (err) {
        // A canceled job must not masquerade as a missing subtitle track
        if (ctx.signal.aborted) throw err;
        throw new InputValidationError("No subtitle track found in this video");
      }

      return {
        scratchPath: outPath,
        filename: outName,
        contentType: "application/x-subrip",
      };
    },
  });
}
