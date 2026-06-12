import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  fps: z.number().int().min(1).max(30).default(12),
  width: z.number().int().min(16).max(1920).default(480),
  quality: z.number().int().min(1).max(100).default(75),
  loop: z.boolean().default(true),
});

export function registerVideoToWebp(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-to-webp",
    settingsSchema,
    process: async () => {
      throw new Error("video-to-webp is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.webp`;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        return [
          "-i",
          inPath,
          "-vf",
          `fps=${settings.fps},scale=${settings.width}:-2:flags=lanczos`,
          "-c:v",
          "libwebp_anim",
          "-quality",
          String(settings.quality),
          "-loop",
          settings.loop ? "0" : "1",
          "-an",
          out,
        ];
      });
      return { scratchPath: outPath, filename: outName, contentType: "image/webp" };
    },
  });
}
