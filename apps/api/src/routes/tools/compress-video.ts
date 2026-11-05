import { resolveEncoder, videoCodecArgs, withVaapiEncodeArgs } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mp4TimescaleArgs, runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  quality: z.enum(["light", "balanced", "strong"]).default("balanced"),
  resolution: z.enum(["original", "1080p", "720p", "480p"]).default("original"),
});

const CRF: Record<string, number> = {
  light: 23,
  balanced: 28,
  strong: 33,
};

const TARGET_HEIGHT: Record<string, number> = {
  "1080p": 1080,
  "720p": 720,
  "480p": 480,
};

/** The quotes keep ffmpeg from reading the comma in min() as a filter separator. */
function downscaleFilter(height: number): string {
  return `scale=-2:'min(ih,${height})'`;
}

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
          ...videoCodecArgs("h264", CRF[settings.quality]),
          "-pix_fmt",
          "yuv420p",
          ...mp4TimescaleArgs(".mp4"),
        ];
        if (settings.resolution !== "original") {
          args.push("-vf", downscaleFilter(TARGET_HEIGHT[settings.resolution]));
        }
        args.push("-c:a", resolveEncoder("aac"), "-b:a", "96k", "-movflags", "+faststart", out);
        return withVaapiEncodeArgs(args);
      });
      return { scratchPath: outPath, filename: outName, contentType: "video/mp4" };
    },
  });
}
