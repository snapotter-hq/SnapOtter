import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";

const settingsSchema = z.object({
  text: z.string().min(1).max(500),
  fontSize: z.number().min(8).max(200).default(48),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  position: z.enum(["top", "center", "bottom"]).default("bottom"),
  backgroundBox: z.boolean().default(false),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  shadow: z.boolean().default(true),
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function registerTextOverlay(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "text-overlay",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const image = sharp(inputBuffer);
      const metadata = await image.metadata();
      const width = metadata.width ?? 800;
      const height = metadata.height ?? 600;
      const escapedText = escapeXml(settings.text);

      let y: number;
      const pad = settings.fontSize;

      switch (settings.position) {
        case "top":
          y = pad + settings.fontSize;
          break;
        case "center":
          y = height / 2;
          break;
        case "bottom":
        default:
          y = height - pad;
          break;
      }

      const x = width / 2;

      // Build SVG text element with optional effects
      let filter = "";
      let filterRef = "";
      if (settings.shadow) {
        filter = `<defs><filter id="shadow"><feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.7)"/></filter></defs>`;
        filterRef = ' filter="url(#shadow)"';
      }

      let bgRect = "";
      if (settings.backgroundBox) {
        const boxH = settings.fontSize * 1.8;
        const boxY = y - settings.fontSize * 0.9;
        bgRect = `<rect x="0" y="${boxY}" width="${width}" height="${boxH}" fill="${settings.backgroundColor}" opacity="0.7"/>`;
      }

      const svgOverlay = `<svg width="${width}" height="${height}">
        ${filter}
        ${bgRect}
        <text x="${x}" y="${y}" font-size="${settings.fontSize}" fill="${settings.color}" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle"${filterRef}>${escapedText}</text>
      </svg>`;

      const svgBuffer = Buffer.from(svgOverlay);
      const result = await image.composite([{ input: svgBuffer, top: 0, left: 0 }]);
      const buffer = await result.toBuffer();

      return { buffer, filename, contentType: "image/png" };
    },
  });
}
