import { extname } from "node:path";
import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  fps: z.number().min(1).max(120).default(30),
});

export function registerChangeFps(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "change-fps",
    settingsSchema,
    process: async () => {
      throw new Error("change-fps is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_fps${origExt}`;
      const contentType = videoContentType(origExt);

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => [
        "-i",
        inPath,
        "-vf",
        `fps=${settings.fps}`,
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
