import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfMetadataGetPy, pdfMetadataSetPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  title: z.string().max(500).optional(),
  author: z.string().max(500).optional(),
  subject: z.string().max(500).optional(),
  keywords: z.string().max(500).optional(),
});

export function registerPdfMetadata(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pdf-metadata",
    settingsSchema,
    process: async () => {
      throw new Error("pdf-metadata is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_metadata.pdf`);
      ctx.report(10, "Setting metadata");

      // Build metadata record from DEFINED keys only (empty string = clear).
      const meta: Record<string, string> = {};
      if (settings.title !== undefined) meta.Title = settings.title;
      if (settings.author !== undefined) meta.Author = settings.author;
      if (settings.subject !== undefined) meta.Subject = settings.subject;
      if (settings.keywords !== undefined) meta.Keywords = settings.keywords;

      await pdfMetadataSetPy(inPath, outPath, meta);
      const metadata = await pdfMetadataGetPy(outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_metadata.pdf`,
        contentType: "application/pdf",
        resultPayload: { metadata },
      };
    },
  });
}
