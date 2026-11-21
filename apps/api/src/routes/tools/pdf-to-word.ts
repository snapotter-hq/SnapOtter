import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfTextPy, pdfToWordPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { noTextLayerError } from "../../lib/no-text-layer.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerPdfToWord(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pdf-to-word",
    settingsSchema,
    process: async () => {
      throw new Error("pdf-to-word is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      // pdf2docx copies a scanned page into the .docx as a picture, so a PDF
      // with no text layer came back as a "successful" Word file with nothing
      // to edit (#4838). Probe with the same check pdf-to-text uses and refuse
      // with its code, which lets the web app offer OCR. The probe only
      // refuses when no page has text, so a partly scanned PDF still converts.
      ctx.report(5, "Checking for text");
      const probe = await pdfTextPy(inPath, join(ctx.scratchDir, "text-probe.txt"), {
        signal: ctx.signal,
      });
      if (!probe.hasText) {
        throw noTextLayerError(probe, {
          scanned: "a Word file would only hold pictures of the pages",
          unreadable: "a Word file would only hold the same unreadable characters",
        });
      }

      const outPath = join(ctx.scratchDir, `${base}.docx`);
      ctx.report(10, "Converting");
      await pdfToWordPy(inPath, outPath, { signal: ctx.signal });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.docx`,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    },
  });
}
