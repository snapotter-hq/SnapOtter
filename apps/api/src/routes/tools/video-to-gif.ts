import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  fps: z.number().int().min(1).max(30).default(12),
  width: z.number().int().min(64).max(1280).default(480),
  startS: z.number().min(0).default(0),
  durationS: z.number().positive().max(60).default(5),
});

export function registerVideoToGif(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-to-gif",
    settingsSchema,
    process: async () => {
      throw new Error("video-to-gif is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.gif`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        return [
          "-ss",
          String(settings.startS),
          "-t",
          String(settings.durationS),
          "-i",
          inPath,
          "-vf",
          `fps=${settings.fps},scale=${settings.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
          out,
        ];
      });
      return { scratchPath: outPath, filename: outName, contentType: "image/gif" };
    },
  });
}
