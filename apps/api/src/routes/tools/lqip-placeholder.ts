import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  width: z.number().int().min(4).max(64).default(16),
  blur: z.number().min(0).max(20).default(2),
  strategy: z.enum(["blur", "pixelate", "solid"]).default("blur"),
  format: z.enum(["webp", "png", "jpeg"]).default("webp"),
  quality: z.number().int().min(1).max(100).default(50),
});

const MIME: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
};

const EXT: Record<string, string> = {
  webp: ".webp",
  png: ".png",
  jpeg: ".jpg",
};

function encode(pipeline: sharp.Sharp, fmt: string, q: number): sharp.Sharp {
  if (fmt === "jpeg") return pipeline.jpeg({ quality: q });
  if (fmt === "png") return pipeline.png();
  return pipeline.webp({ quality: q });
}

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

      let pipeline: sharp.Sharp;

      if (settings.strategy === "solid") {
        const pixel = await sharp(inputBuffer).resize(1, 1).raw().toBuffer();
        pipeline = sharp({
          create: {
            width: settings.width,
            height: settings.width,
            channels: 3,
            background: { r: pixel[0], g: pixel[1], b: pixel[2] },
          },
        });
      } else if (settings.strategy === "pixelate") {
        pipeline = sharp(inputBuffer).resize(settings.width, null, {
          kernel: sharp.kernel.nearest,
        });
      } else {
        pipeline = sharp(inputBuffer).resize(settings.width);
        if (settings.blur > 0) {
          pipeline = pipeline.blur(settings.blur);
        }
      }

      const buffer = await encode(pipeline, settings.format, settings.quality).toBuffer();
      const meta = await sharp(buffer).metadata();
      const mime = MIME[settings.format];
      const dataUri = `data:${mime};base64,${buffer.toString("base64")}`;

      const base = filename.replace(/\.[^.]+$/, "");
      return {
        buffer,
        filename: `${base}_lqip${EXT[settings.format]}`,
        contentType: mime,
        resultPayload: {
          dataUri,
          width: meta.width ?? settings.width,
          height: meta.height ?? 0,
          bytes: buffer.length,
          strategy: settings.strategy,
          html: `<img src="${dataUri}" />`,
          css: `background-image:url('${dataUri}');background-size:cover;background-position:center;`,
        },
      };
    },
  });
}
