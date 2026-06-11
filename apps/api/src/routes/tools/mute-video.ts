import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

const EXT_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
};

export function registerMuteVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "mute-video",
    settingsSchema,
    process: async () => {
      throw new Error("mute-video is v2-only");
    },
    processV2: async (ctx) => {
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_muted${origExt}`;
      const contentType = EXT_CONTENT_TYPES[origExt.toLowerCase()] || "video/mp4";

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        return ["-i", inPath, "-c", "copy", "-an", out];
      });
      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
