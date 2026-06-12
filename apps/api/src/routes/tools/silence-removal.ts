import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioOutputFor, runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  thresholdDb: z.number().min(-80).max(-20).default(-50),
  minSilenceS: z.number().min(0.1).max(5).default(0.5),
});

export function registerSilenceRemoval(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "silence-removal",
    settingsSchema,
    process: async () => {
      throw new Error("silence-removal is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const out = audioOutputFor(origExt);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_nosilence${out.ext}`;

      const t = settings.thresholdDb;
      const d = settings.minSilenceS;
      const chain =
        `silenceremove=start_periods=1:start_threshold=${t}dB:start_silence=0.1` +
        `:stop_periods=-1:stop_threshold=${t}dB:stop_duration=${d}`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, outPath) => {
        return ["-i", inPath, "-af", chain, ...out.encodeArgs, outPath];
      });
      return { scratchPath: outPath, filename: outName, contentType: out.contentType };
    },
  });
}
