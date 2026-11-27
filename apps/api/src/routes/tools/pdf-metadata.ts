import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type PdfMetadataStripResult,
  pdfMetadataGetPy,
  pdfMetadataSetPy,
  pdfMetadataStripPy,
} from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    title: z.string().max(500).optional(),
    author: z.string().max(500).optional(),
    subject: z.string().max(500).optional(),
    keywords: z.string().max(500).optional(),
    // Clear the whole Info dictionary and the XMP stream before writing the fields above.
    stripAll: z.boolean().optional(),
    // Also drop embedded files. Opt-in because it changes the document's content.
    removeAttachments: z.boolean().optional(),
  })
  .refine((s) => !s.removeAttachments || s.stripAll, {
    message: "removeAttachments requires stripAll",
    path: ["removeAttachments"],
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

      // Build metadata record from DEFINED keys only (empty string = clear).
      const meta: Record<string, string> = {};
      if (settings.title !== undefined) meta.Title = settings.title;
      if (settings.author !== undefined) meta.Author = settings.author;
      if (settings.subject !== undefined) meta.Subject = settings.subject;
      if (settings.keywords !== undefined) meta.Keywords = settings.keywords;

      let stripped: PdfMetadataStripResult | undefined;
      if (settings.stripAll) {
        ctx.report(10, "Removing metadata");
        stripped = await pdfMetadataStripPy(inPath, outPath, meta, {
          signal: ctx.signal,
          removeAttachments: settings.removeAttachments,
        });
      } else {
        ctx.report(10, "Setting metadata");
        await pdfMetadataSetPy(inPath, outPath, meta, { signal: ctx.signal });
      }
      const metadata = await pdfMetadataGetPy(outPath, { signal: ctx.signal });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_metadata.pdf`,
        contentType: "application/pdf",
        resultPayload: stripped ? { metadata, stripped } : { metadata },
      };
    },
  });
}
