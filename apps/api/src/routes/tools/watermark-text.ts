import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  text: z.string().min(1).max(500),
  fontSize: z.number().min(8).max(1000).default(48),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#000000"),
  opacity: z.number().min(0).max(100).default(50),
  position: z
    .enum(["center", "top-left", "top-right", "bottom-left", "bottom-right", "tiled"])
    .default("center"),
  rotation: z.number().min(-360).max(360).default(0),
});

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity / 100})`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function registerWatermarkText(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "watermark-text",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const outputFormat = await resolveOutputFormat(inputBuffer, filename);
      const image = sharp(inputBuffer);
      const metadata = await image.metadata();
      const width = metadata.width ?? 800;
      const height = metadata.height ?? 600;
      const rgba = hexToRgba(settings.color, settings.opacity);
      const escapedText = escapeXml(settings.text);

      let svgOverlay: string;

      if (settings.position === "tiled") {
        // Create tiled watermark
        const spacingX = settings.fontSize * 6;
        const spacingY = settings.fontSize * 4;
        let textElements = "";
        const maxElements = 500;
        let count = 0;
        outer: for (let y = 0; y < height + spacingY; y += spacingY) {
          for (let x = 0; x < width + spacingX; x += spacingX) {
            if (count >= maxElements) break outer;
            textElements += `<text x="${x}" y="${y}" font-size="${settings.fontSize}" fill="${rgba}" font-family="sans-serif" transform="rotate(${settings.rotation},${x},${y})">${escapedText}</text>`;
            count++;
          }
        }
        svgOverlay = `<svg width="${width}" height="${height}">${textElements}</svg>`;
      } else {
        // Single watermark at specified position
        let x: number, y: number;
        let anchor = "middle";
        const pad = settings.fontSize;

        switch (settings.position) {
          case "top-left":
            x = pad;
            y = pad + settings.fontSize;
            anchor = "start";
            break;
          case "top-right":
            x = width - pad;
            y = pad + settings.fontSize;
            anchor = "end";
            break;
          case "bottom-left":
            x = pad;
            y = height - pad;
            anchor = "start";
            break;
          case "bottom-right":
            x = width - pad;
            y = height - pad;
            anchor = "end";
            break;
          default:
            x = width / 2;
            y = height / 2;
            anchor = "middle";
            break;
        }

        svgOverlay = `<svg width="${width}" height="${height}">
          <text x="${x}" y="${y}" font-size="${settings.fontSize}" fill="${rgba}" font-family="sans-serif" text-anchor="${anchor}" transform="rotate(${settings.rotation},${x},${y})">${escapedText}</text>
        </svg>`;
      }

      const svgBuffer = Buffer.from(svgOverlay);
      const result = await image.composite([{ input: svgBuffer, top: 0, left: 0 }]);
      const buffer = await result
        .toFormat(outputFormat.format, { quality: outputFormat.quality })
        .toBuffer();

      return { buffer, filename, contentType: outputFormat.contentType };
    },
  });
}
