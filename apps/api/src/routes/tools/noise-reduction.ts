import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audioOutputFor, runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const NR_MAP: Record<string, number> = {
  light: 6,
  medium: 12,
  strong: 24,
};

const settingsSchema = z.object({
  strength: z.enum(["light", "medium", "strong"]).default("medium"),
});

export function registerNoiseReduction(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "noise-reduction",
    settingsSchema,
    process: async () => {
      throw new Error("noise-reduction is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp3";
      const out = audioOutputFor(origExt);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_denoised${out.ext}`;

      const nr = NR_MAP[settings.strength];
      const chain = `afftdn=nr=${nr}:nf=-50`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, outPath) => {
        return ["-i", inPath, "-af", chain, ...out.encodeArgs, outPath];
      });
      return { scratchPath: outPath, filename: outName, contentType: out.contentType };
    },
  });
}
