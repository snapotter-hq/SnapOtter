import { resolveEncoder } from "@snapotter/media-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  format: z.enum(["mp4", "mov", "webm"]).default("mp4"),
  quality: z.enum(["high", "balanced", "small"]).default("balanced"),
});

const CRF: Record<string, { h264: string; vp9: string }> = {
  high: { h264: "18", vp9: "24" },
  balanced: { h264: "23", vp9: "32" },
  small: { h264: "28", vp9: "40" },
};

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function registerConvertVideo(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert-video",
    settingsSchema,
    process: async () => {
      throw new Error("convert-video is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}.${settings.format}`;
      const { outPath } = await runMediaTool(ctx, outName, (inPath, out) => {
        if (settings.format === "webm") {
          return [
            "-i",
            inPath,
            "-c:v",
            resolveEncoder("vp9"),
            "-crf",
            CRF[settings.quality].vp9,
            "-b:v",
            "0",
            "-c:a",
            resolveEncoder("opus"),
            out,
          ];
        }
        return [
          "-i",
          inPath,
          "-c:v",
          resolveEncoder("h264"),
          "-crf",
          CRF[settings.quality].h264,
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          resolveEncoder("aac"),
          "-b:a",
          "128k",
          "-movflags",
          "+faststart",
          out,
        ];
      });
      return {
        scratchPath: outPath,
        filename: outName,
        contentType: CONTENT_TYPES[settings.format],
      };
    },
  });
}
