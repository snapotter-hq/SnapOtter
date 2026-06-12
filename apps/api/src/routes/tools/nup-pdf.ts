import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NupValue } from "@snapotter/doc-engine";
import { pdfcpuNup } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  perSheet: z
    .union([
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(8),
      z.literal(9),
      z.literal(12),
      z.literal(16),
    ])
    .default(2),
});

export function registerNupPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "nup-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("nup-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_nup.pdf`);
      ctx.report(10, "Arranging pages");
      await pdfcpuNup(inPath, settings.perSheet as NupValue, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_nup.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
