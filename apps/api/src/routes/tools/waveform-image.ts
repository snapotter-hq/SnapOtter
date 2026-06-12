import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { runMediaTool } from "../../lib/media-tool.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  width: z.number().int().min(256).max(3840).default(1024),
  height: z.number().int().min(64).max(1080).default(256),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#4f46e5"),
});

export function registerWaveformImage(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "waveform-image",
    settingsSchema,
    process: async () => {
      throw new Error("waveform-image is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const base = ctx.inputs[0].filename.replace(/\.[^.]+$/, "");
      const outName = `${base}_waveform.png`;

      const c = settings.color.replace("#", "0x");
      const w = settings.width;
      const h = settings.height;

      const { outPath } = await runMediaTool(ctx, outName, (inPath, outPath) => {
        return [
          "-i",
          inPath,
          "-filter_complex",
          `showwavespic=s=${w}x${h}:colors=${c}`,
          "-frames:v",
          "1",
          outPath,
        ];
      });

      return { scratchPath: outPath, filename: outName, contentType: "image/png" };
    },
  });
}
