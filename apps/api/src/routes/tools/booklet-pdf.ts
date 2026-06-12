import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BookletValue } from "@snapotter/doc-engine";
import { pdfcpuBooklet } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  perSheet: z.union([z.literal(2), z.literal(4), z.literal(6), z.literal(8)]).default(2),
});

export function registerBookletPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "booklet-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("booklet-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_booklet.pdf`);
      ctx.report(10, "Creating booklet");
      await pdfcpuBooklet(inPath, settings.perSheet as BookletValue, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_booklet.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
