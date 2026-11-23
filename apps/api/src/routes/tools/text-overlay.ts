import type { FastifyInstance } from "fastify";
import sharp, { type OverlayOptions } from "sharp";
import { z } from "zod";
import { runPerFrame } from "../../lib/animated-image.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { renderTextOverlays } from "../../lib/text-overlay-render.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  text: z.string().min(1).max(500),
  fontSize: z.number().min(8).max(200).default(48),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#FFFFFF"),
  position: z.enum(["top", "center", "bottom", "custom"]).default("bottom"),
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  wrap: z.boolean().default(true),
  maxWidth: z.number().min(10).max(100).default(90),
  backgroundBox: z.boolean().default(false),
  backgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#000000"),
  shadow: z.boolean().default(true),
});

export function registerTextOverlay(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "text-overlay",
    settingsSchema,
    process: withImageEncodeContext<z.infer<typeof settingsSchema>>(
      "Text overlay failed",
      (s) => s?.position ?? "bottom",
      async (inputBuffer, settings, filename) => {
        const outputFormat = await resolveOutputFormat(inputBuffer, filename);
        // The text is composited, and a composite lands on the first frame only,
        // so animation is handled a frame at a time (#1083).
        // Every frame of an animation is the same size, so lay the text out once.
        let cached: { key: string; overlays: OverlayOptions[] } | undefined;
        const core = async (source: Buffer, format = outputFormat): Promise<Buffer> => {
          const image = sharp(source);
          const metadata = await image.metadata();
          const width = metadata.width ?? 800;
          const height = metadata.height ?? 600;
          const key = `${width}x${height}`;
          if (cached?.key !== key) {
            cached = { key, overlays: await renderTextOverlays(settings, { width, height }) };
          }
          const overlays = cached.overlays;
          const result = image.composite(overlays);
          return await result.toFormat(format.format, format.encoderOptions).toBuffer();
        };

        let buffer: Buffer;
        try {
          buffer =
            (await runPerFrame(inputBuffer, outputFormat, core)) ?? (await core(inputBuffer));
        } catch (err) {
          throw await asInputErrorIfUndecodable(inputBuffer, err);
        }

        return { buffer, filename, contentType: outputFormat.contentType };
      },
    ),
  });
}
