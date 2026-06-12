import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfcpuTextStamp } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  position: z.enum(["bl", "bc", "br", "tl", "tc", "tr"]).default("bc"),
  fontSize: z.number().int().min(6).max(24).default(10),
});

export function registerPdfPageNumbers(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pdf-page-numbers",
    settingsSchema,
    process: async () => {
      throw new Error("pdf-page-numbers is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_numbered.pdf`);
      ctx.report(10, "Adding page numbers");
      await pdfcpuTextStamp(
        inPath,
        {
          text: "Page %p of %P",
          position: settings.position,
          fontSize: settings.fontSize,
          opacity: 1,
          rotation: 0,
        },
        outPath,
      );
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_numbered.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
