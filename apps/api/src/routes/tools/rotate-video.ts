import { extname } from "node:path";
import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool, videoContentType } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const VF_MAP: Record<string, string> = {
  cw90: "transpose=1",
  ccw90: "transpose=2",
  "180": "transpose=1,transpose=1",
  hflip: "hflip",
  vflip: "vflip",
};

const settingsSchema = z.object({
  transform: z.enum(["cw90", "ccw90", "180", "hflip", "vflip"]),
});

export function registerRotateVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "rotate-video",
    settingsSchema,
    process: async () => {
      throw new Error("rotate-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_rotated${origExt}`;
      const contentType = videoContentType(origExt);

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => [
        "-i",
        inPath,
        "-vf",
        VF_MAP[settings.transform],
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
