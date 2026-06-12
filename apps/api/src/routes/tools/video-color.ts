import { extname } from "node:path";
import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  brightness: z.number().min(-1).max(1).default(0),
  contrast: z.number().min(0).max(4).default(1),
  saturation: z.number().min(0).max(3).default(1),
  gamma: z.number().min(0.1).max(10).default(1),
});

export function registerVideoColor(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "video-color",
    settingsSchema,
    process: async () => {
      throw new Error("video-color is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_color${origExt}`;
      const contentType = videoContentType(origExt);

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => [
        "-i",
        inPath,
        "-vf",
        `eq=brightness=${settings.brightness}:contrast=${settings.contrast}:saturation=${settings.saturation}:gamma=${settings.gamma}`,
        "-c:v",
        resolveEncoder("h264"),
        "-crf",
        "20",
        "-preset",
        "medium",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        out,
      ]);
      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
