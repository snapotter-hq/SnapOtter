import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  width: z.number().int().min(4).max(64).default(16),
  blur: z.number().min(0).max(20).default(2),
});

export function registerLqipPlaceholder(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "lqip-placeholder",
    settingsSchema,
    process: async () => {
      throw new Error("lqip-placeholder is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const inputBuffer = ctx.inputs[0].buffer;
      const filename = ctx.inputs[0].filename;

      let pipeline = sharp(inputBuffer).resize(settings.width);

      if (settings.blur > 0) {
        pipeline = pipeline.blur(settings.blur);
      }

      const buffer = await pipeline.webp({ quality: 50 }).toBuffer();

      const meta = await sharp(buffer).metadata();
      const dataUri = `data:image/webp;base64,${buffer.toString("base64")}`;

      const base = filename.replace(/\.[^.]+$/, "");
      return {
        buffer,
        filename: `${base}_lqip.webp`,
        contentType: "image/webp",
        resultPayload: {
          dataUri,
          width: meta.width ?? settings.width,
          height: meta.height ?? 0,
          bytes: buffer.length,
        },
      };
    },
  });
}
