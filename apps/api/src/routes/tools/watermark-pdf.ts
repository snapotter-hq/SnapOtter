import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfcpuTextStamp } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  text: z.string().min(1).max(200),
  position: z.enum(["tl", "tc", "tr", "l", "c", "r", "bl", "bc", "br"]).default("c"),
  fontSize: z.number().int().min(6).max(72).default(48),
  opacity: z.number().min(0.05).max(1).default(0.3),
  rotation: z.number().min(-180).max(180).default(45),
});

export function registerWatermarkPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "watermark-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("watermark-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_watermarked.pdf`);
      ctx.report(10, "Stamping watermark");
      await pdfcpuTextStamp(
        inPath,
        {
          text: settings.text,
          position: settings.position,
          fontSize: settings.fontSize,
          opacity: settings.opacity,
          rotation: settings.rotation,
        },
        outPath,
      );
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_watermarked.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
