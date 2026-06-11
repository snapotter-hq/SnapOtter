import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  quality: z.enum(["light", "balanced", "strong"]).default("balanced"),
  resolution: z.enum(["original", "1080p", "720p", "480p"]).default("original"),
});

const CRF: Record<string, string> = {
  light: "23",
  balanced: "28",
  strong: "33",
};

const SCALE: Record<string, string> = {
  "1080p": "scale=-2:1080",
  "720p": "scale=-2:720",
  "480p": "scale=-2:480",
};

export function registerCompressVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "compress-video",
    settingsSchema,
    process: async () => {
      throw new Error("compress-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_compressed.mp4`;
      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        const args = [
          "-i",
          inPath,
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          CRF[settings.quality],
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
        ];
        if (settings.resolution !== "original") {
          args.push("-vf", SCALE[settings.resolution]);
        }
        args.push("-c:a", resolveEncoder("aac"), "-b:a", "96k", "-movflags", "+faststart", out);
        return args;
      });
      return { scratchPath: outPath, filename: outName, contentType: "video/mp4" };
    },
  });
}
