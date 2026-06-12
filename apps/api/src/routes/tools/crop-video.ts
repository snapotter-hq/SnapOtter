import { extname, join } from "node:path";
import { probeMedia, resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runFfmpegWithProgress, stageMediaInputs, videoContentType } from "../../lib/media-tool.js";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  width: z.number().int().min(16),
  height: z.number().int().min(16),
  x: z.number().int().min(0).default(0),
  y: z.number().int().min(0).default(0),
});

export function registerCropVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "crop-video",
    settingsSchema,
    process: async () => {
      throw new Error("crop-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const origExt = extname(ctx.inputs[0].filename) || ".mp4";
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_cropped${origExt}`;
      const contentType = videoContentType(origExt);

      const [inPath] = await stageMediaInputs(ctx);
      const info = await probeMedia(inPath);
      const v = info.streams.find((s) => s.type === "video");
      const W = v?.width ?? 0;
      const H = v?.height ?? 0;

      if (settings.x + settings.width > W || settings.y + settings.height > H) {
        throw new InputValidationError(
          `Crop rectangle ${settings.width}x${settings.height}+${settings.x}+${settings.y} exceeds video size ${W}x${H}`,
        );
      }

      const outPath = join(ctx.scratchDir, "media", outName);
      await runFfmpegWithProgress(
        ctx,
        [
          "-i",
          inPath,
          "-vf",
          `crop=${settings.width}:${settings.height}:${settings.x}:${settings.y}`,
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
          outPath,
        ],
        info.durationS,
      );

      return { scratchPath: outPath, filename: outName, contentType };
    },
  });
}
