import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const settingsSchema = z.object({
  borderWidth: z.number().min(0).max(2000).default(10),
  borderColor: hexColor.default("#000000"),
  padding: z.number().min(0).max(200).default(0),
  paddingColor: hexColor.default("#FFFFFF"),
  cornerRadius: z.number().min(0).max(2000).default(0),
  shadow: z.boolean().default(false),
  shadowBlur: z.number().min(1).max(200).default(15),
  shadowOffsetX: z.number().min(-50).max(50).default(0),
  shadowOffsetY: z.number().min(-50).max(50).default(5),
  shadowColor: hexColor.default("#000000"),
  shadowOpacity: z.number().min(0).max(100).default(40),
});

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function registerBorder(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "border",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      let buf = inputBuffer;

      // 1. Add padding
      if (settings.padding > 0) {
        const c = parseHex(settings.paddingColor);
        buf = await sharp(buf)
          .extend({
            top: settings.padding,
            bottom: settings.padding,
            left: settings.padding,
            right: settings.padding,
            background: { r: c.r, g: c.g, b: c.b, alpha: 1 },
          })
          .toBuffer();
      }

      // 2. Add border
      if (settings.borderWidth > 0) {
        const c = parseHex(settings.borderColor);
        buf = await sharp(buf)
          .extend({
            top: settings.borderWidth,
            bottom: settings.borderWidth,
            left: settings.borderWidth,
            right: settings.borderWidth,
            background: { r: c.r, g: c.g, b: c.b, alpha: 1 },
          })
          .toBuffer();
      }

      // 3. Apply corner radius
      if (settings.cornerRadius > 0) {
        buf = await sharp(buf).ensureAlpha().png().toBuffer();
        const meta = await sharp(buf).metadata();
        const w = meta.width ?? 100;
        const h = meta.height ?? 100;
        const r = Math.min(settings.cornerRadius, w / 2, h / 2);

        const mask = Buffer.from(
          `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`,
        );
        buf = await sharp(buf)
          .composite([{ input: await sharp(mask).resize(w, h).toBuffer(), blend: "dest-in" }])
          .png()
          .toBuffer();
      }

      // 4. Apply shadow
      if (settings.shadow) {
        buf = await sharp(buf).ensureAlpha().png().toBuffer();
        const meta = await sharp(buf).metadata();
        const bW = meta.width ?? 100;
        const bH = meta.height ?? 100;

        const sc = parseHex(settings.shadowColor);
        const alpha = settings.shadowOpacity / 100;
        const blur = settings.shadowBlur;
        const spread = Math.ceil(blur * 2);
        const ox = settings.shadowOffsetX;
        const oy = settings.shadowOffsetY;

        // Create shadow silhouette matching image shape (respects rounded corners)
        const shadowSilhouette = await sharp({
          create: {
            width: bW,
            height: bH,
            channels: 4,
            background: { r: sc.r, g: sc.g, b: sc.b, alpha },
          },
        })
          .composite([{ input: buf, blend: "dest-in" }])
          .extend({
            top: spread,
            bottom: spread,
            left: spread,
            right: spread,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .blur(Math.max(blur, 0.3))
          .png()
          .toBuffer();

        // Calculate canvas padding for shadow spread + offset
        const padL = Math.max(0, spread - ox);
        const padR = Math.max(0, spread + ox);
        const padT = Math.max(0, spread - oy);
        const padB = Math.max(0, spread + oy);

        const canvasW = bW + padL + padR;
        const canvasH = bH + padT + padB;

        const imgX = padL;
        const imgY = padT;
        const shadX = Math.max(0, imgX + ox - spread);
        const shadY = Math.max(0, imgY + oy - spread);

        buf = await sharp({
          create: {
            width: canvasW,
            height: canvasH,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([
            { input: shadowSilhouette, left: shadX, top: shadY },
            { input: buf, left: imgX, top: imgY },
          ])
          .png()
          .toBuffer();
      }

      const buffer = await sharp(buf).png().toBuffer();
      const outName = filename.replace(/\.[^.]+$/, ".png");
      return { buffer, filename: outName, contentType: "image/png" };
    },
  });
}
