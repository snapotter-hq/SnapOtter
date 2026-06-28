import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  format: z.enum(["mp4", "webm", "mov"]).default("mp4"),
});

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function registerGifToVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "gif-to-video",
    settingsSchema,
    process: async () => {
      throw new Error("gif-to-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.${settings.format}`;
      const contentType = CONTENT_TYPES[settings.format];

      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        if (settings.format === "webm") {
          return [
            "-i",
            inPath,
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v",
            resolveEncoder("vp9"),
            "-b:v",
            "0",
            "-crf",
            "32",
            // GIFs decode to bgra/gbrap (alpha); libvpx-vp9 rejects those pixel
            // formats, so flatten to yuv420p just like the mp4 branch does.
            "-pix_fmt",
            "yuv420p",
            "-an",
            out,
          ];
        }
        return [
          "-i",
          inPath,
          "-vf",
          "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          "20",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-an",
          out,
        ];
      });
      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
