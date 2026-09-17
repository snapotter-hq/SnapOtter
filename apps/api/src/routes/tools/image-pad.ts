import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { isAnimated, runPerFrame } from "../../lib/animated-image.js";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  target: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4", "custom"]).default("1:1"),
  ratioW: z.number().int().min(1).max(100).default(1),
  ratioH: z.number().int().min(1).max(100).default(1),
  background: z.enum(["color", "transparent", "blur"]).default("color"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
  padding: z.number().int().min(0).max(50).default(0),
});

/** Compute canvas dimensions for the given target aspect ratio. */
export function canvasFor(w: number, h: number, target: string): { cw: number; ch: number } {
  const [tw, th] = target.split(":").map(Number);
  const targetRatio = tw / th;
  const srcRatio = w / h;

  let cw: number;
  let ch: number;

  if (srcRatio > targetRatio) {
    // Image is wider than target: expand height
    cw = w;
    ch = Math.round(w / targetRatio);
  } else {
    // Image is taller than target: expand width
    ch = h;
    cw = Math.round(h * targetRatio);
  }

  return { cw, ch };
}

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function registerImagePad(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "image-pad",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      // A transparent background forces a container with alpha. PNG is that
      // container for a still, but it cannot hold frames, so an animation goes
      // to WebP instead of being flattened (#1083). No quality for the forced
      // PNG: Sharp reads it as palette quantisation, which dithers the padded
      // image (#710).
      const outputFormat =
        settings.background !== "transparent"
          ? await resolveOutputFormat(inputBuffer, filename)
          : (await isAnimated(inputBuffer))
            ? {
                format: "webp" as const,
                extension: "webp",
                contentType: "image/webp",
                quality: 95,
              }
            : {
                format: "png" as const,
                extension: "png",
                contentType: "image/png",
                quality: undefined,
              };

      // The blur background composites the original over a blurred canvas, and
      // a composite lands on the first frame only, so animation is handled a
      // frame at a time (#1083).
      const core = async (source: Buffer): Promise<Buffer> => {
        const meta = await sharp(source).metadata();
        const w = meta.width ?? 1;
        const h = meta.height ?? 1;

        // Resolve target ratio; custom uses ratioW:ratioH
        const ratioStr =
          settings.target === "custom" ? `${settings.ratioW}:${settings.ratioH}` : settings.target;

        const { cw, ch } = canvasFor(w, h, ratioStr);

        // Extra uniform padding margin (% of the canvas larger side)
        const margin =
          settings.padding > 0 ? Math.round((Math.max(cw, ch) * settings.padding) / 100) : 0;
        const finalW = cw + margin * 2;
        const finalH = ch + margin * 2;

        const padTop = Math.floor((finalH - h) / 2);
        const padBottom = finalH - h - padTop;
        const padLeft = Math.floor((finalW - w) / 2);
        const padRight = finalW - w - padLeft;

        let buf: Buffer;

        if (settings.background === "blur") {
          // Instagram-style: blurred cover fill + sharp original composited on top
          const blurred = await sharp(source)
            .resize(finalW, finalH, { fit: "cover" })
            .blur(20)
            .png()
            .toBuffer();
          buf = await sharp(blurred)
            .composite([{ input: source, top: padTop, left: padLeft }])
            .png()
            .toBuffer();
        } else if (settings.background === "transparent") {
          buf = await sharp(source)
            .ensureAlpha()
            .extend({
              top: padTop,
              bottom: padBottom,
              left: padLeft,
              right: padRight,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer();
        } else {
          const c = parseHex(settings.color);
          buf = await sharp(source)
            .extend({
              top: padTop,
              bottom: padBottom,
              left: padLeft,
              right: padRight,
              background: { r: c.r, g: c.g, b: c.b, alpha: 1 },
            })
            .toBuffer();
        }

        return await sharp(buf)
          .toFormat(outputFormat.format, { quality: outputFormat.quality })
          .toBuffer();
      };

      const buffer =
        (await runPerFrame(inputBuffer, outputFormat.format, core)) ?? (await core(inputBuffer));
      const base = filename.replace(/\.[^.]+$/, "");
      const ext = outputFormat.extension;
      return {
        buffer,
        filename: `${base}_padded.${ext}`,
        contentType: outputFormat.contentType,
      };
    },
  });
}
