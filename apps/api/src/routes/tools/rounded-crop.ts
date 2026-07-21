import type { FastifyInstance } from "fastify";
import sharp, { type OverlayOptions } from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  // Which shape to mask to: a rounded rectangle or an iOS-style squircle.
  shape: z.enum(["rounded-square", "squircle"]).default("rounded-square"),
  // Corner radius as a percent of the shorter side (0 = square, 50 = circle).
  // Only used for the "rounded-square" shape; the squircle is a fixed curve.
  cornerRadius: z.number().min(0).max(50).default(25),
  // Framing: zoom (>=1 crops tighter) + where the box sits in the image (0..1).
  zoom: z.number().min(1).max(5).default(1),
  offsetX: z.number().min(0).max(1).default(0.5),
  offsetY: z.number().min(0).max(1).default(0.5),
  // Styling.
  borderWidth: z.number().int().min(0).max(200).default(0),
  borderColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#ffffff"),
  // "transparent" leaves the corners clear; a hex fills them.
  background: z
    .string()
    .regex(/^(transparent|#[0-9a-fA-F]{6})$/)
    .default("transparent"),
  // Final output dimension in px (square). Omitted = native size.
  outputSize: z.number().int().min(16).max(4096).optional(),
});

type Shape = z.infer<typeof settingsSchema>["shape"];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

// Superellipse (Lamé curve) |x/a|^n + |y/a|^n = 1 sampled into an SVG polygon.
// n = 4 gives the rounded-but-square "squircle" look.
const SQUIRCLE_N = 4;
const SQUIRCLE_SAMPLES = 128;

function squirclePath(size: number): string {
  const a = size / 2;
  const exp = 2 / SQUIRCLE_N;
  const pts: string[] = [];
  for (let i = 0; i < SQUIRCLE_SAMPLES; i++) {
    const t = (i / SQUIRCLE_SAMPLES) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = a + a * Math.sign(c) * Math.abs(c) ** exp;
    const y = a + a * Math.sign(s) * Math.abs(s) ** exp;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

// A single-shape SVG the size of `size`, filled with `fill`. `radiusPx` only
// applies to the rounded rectangle.
function shapeSvg(shape: Shape, size: number, radiusPx: number, fill: string): Buffer {
  const body =
    shape === "squircle"
      ? `<path d="${squirclePath(size)}" fill="${fill}"/>`
      : `<rect width="${size}" height="${size}" rx="${radiusPx}" ry="${radiusPx}" fill="${fill}"/>`;
  return Buffer.from(`<svg width="${size}" height="${size}">${body}</svg>`);
}

export function registerRoundedCrop(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "rounded-crop",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const meta = await sharp(inputBuffer).metadata();
      const W = meta.width ?? 1;
      const H = meta.height ?? 1;

      // The crop box, derived from zoom + offsets.
      let d = Math.round(Math.min(W, H) / settings.zoom);
      d = Math.max(8, Math.min(d, W, H));
      let left = Math.round((W - d) * settings.offsetX);
      let top = Math.round((H - d) * settings.offsetY);
      left = Math.max(0, Math.min(left, W - d));
      top = Math.max(0, Math.min(top, H - d));

      const bw = Math.min(settings.borderWidth, Math.floor(d / 2));
      const canvas = d + 2 * bw;
      // Percent of the shorter side, capped at half (a full round = circle).
      const radiusPx = Math.min((settings.cornerRadius / 100) * d, d / 2);

      // Extract the square, mask it to the chosen shape.
      const squareBuf = await sharp(inputBuffer)
        .extract({ left, top, width: d, height: d })
        .toBuffer();
      const mask = shapeSvg(settings.shape, d, radiusPx, "#fff");
      const imgShape = await sharp(squareBuf)
        .ensureAlpha()
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer();

      // Compose: background, optional border, then the masked image on top.
      const bg =
        settings.background === "transparent"
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : { ...hexToRgb(settings.background), alpha: 1 };
      const layers: OverlayOptions[] = [];
      if (bw > 0) {
        // Outward offset of a rounded rect keeps straight edges and grows the
        // corner radius by the border width; the squircle border is the same
        // curve scaled to the outer canvas.
        const ring = shapeSvg(settings.shape, canvas, radiusPx + bw, settings.borderColor);
        layers.push({ input: ring, left: 0, top: 0 });
      }
      layers.push({ input: imgShape, left: bw, top: bw });

      let out = await sharp({
        create: { width: canvas, height: canvas, channels: 4, background: bg },
      })
        .composite(layers)
        .png()
        .toBuffer();

      if (settings.outputSize) {
        out = await sharp(out)
          .resize(settings.outputSize, settings.outputSize, { fit: "fill" })
          .png()
          .toBuffer();
      }

      const base = filename.replace(/\.[^.]+$/, "");
      return { buffer: out, filename: `${base}_rounded.png`, contentType: "image/png" };
    },
  });
}
