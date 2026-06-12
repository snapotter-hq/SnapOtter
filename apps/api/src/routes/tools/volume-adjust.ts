import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioOutputFor, runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  gainDb: z.number().min(-30).max(30).default(3),
});

export function registerVolumeAdjust(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "volume-adjust",
    settingsSchema,
    process: async () => {
      throw new Error("volume-adjust is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const out = audioOutputFor(origExt);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_volume${out.ext}`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, outPath) => {
        return ["-i", inPath, "-af", `volume=${settings.gainDb}dB`, ...out.encodeArgs, outPath];
      });
      return { scratchPath: outPath, filename: outName, contentType: out.contentType };
    },
  });
}
