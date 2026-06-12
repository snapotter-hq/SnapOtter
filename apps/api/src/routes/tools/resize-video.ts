import { extname } from "node:path";
import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const PRESET_HEIGHTS: Record<string, number> = {
  "2160p": 2160,
  "1440p": 1440,
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
  "360p": 360,
};

const settingsSchema = z
  .object({
    width: z.number().int().min(16).max(7680).optional(),
    height: z.number().int().min(16).max(4320).optional(),
    preset: z.enum(["custom", "2160p", "1440p", "1080p", "720p", "480p", "360p"]).default("custom"),
  })
  .refine((s) => s.preset !== "custom" || s.width !== undefined || s.height !== undefined, {
    message: "Set a width, height, or preset",
  });

export function registerResizeVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "resize-video",
    settingsSchema,
    process: async () => {
      throw new Error("resize-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_resized${origExt}`;
      const contentType = videoContentType(origExt);

      let w: number | string;
      let h: number | string;
      if (settings.preset !== "custom") {
        w = -2;
        h = PRESET_HEIGHTS[settings.preset];
      } else {
        w = settings.width ?? -2;
        h = settings.height ?? -2;
      }

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => [
        "-i",
        inPath,
        "-vf",
        `scale=${w}:${h}:flags=lanczos`,
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
