import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioOutputFor, runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    semitones: z.number().int().min(-12).max(12).default(3),
  })
  .refine((s) => s.semitones !== 0, { message: "Semitones must be nonzero" });

export function registerPitchShift(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pitch-shift",
    settingsSchema,
    process: async () => {
      throw new Error("pitch-shift is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const out = audioOutputFor(origExt);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_pitch${out.ext}`;

      const ratio = (2 ** (settings.semitones / 12)).toFixed(6);

      const { outPath } = await runMediaTool(ctx, outName, (inPath, outPath) => {
        return ["-i", inPath, "-af", `rubberband=pitch=${ratio}`, ...out.encodeArgs, outPath];
      });
      return { scratchPath: outPath, filename: outName, contentType: out.contentType };
    },
  });
}
