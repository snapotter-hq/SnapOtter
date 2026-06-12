import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfcpuCropMargin } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  margin: z.number().min(0).max(2000).default(20),
});

export function registerCropPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "crop-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("crop-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_cropped.pdf`);
      ctx.report(10, "Cropping");
      await pdfcpuCropMargin(inPath, settings.margin, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_cropped.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
