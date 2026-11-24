import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfTextPy, pdfToMarkdownPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { noTextLayerError } from "../../lib/no-text-layer.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerPdfToMarkdown(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pdf-to-markdown",
    settingsSchema,
    process: async () => {
      throw new Error("pdf-to-markdown is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      // A scanned PDF has no text layer, so the Markdown would come back
      // empty. Probe with the check pdf-to-text uses and refuse with its code,
      // which lets the web app offer OCR (#589, #1164).
      ctx.report(5, "Checking for text");
      const probe = await pdfTextPy(inPath, join(ctx.scratchDir, "text-probe.txt"), {
        signal: ctx.signal,
      });
      if (!probe.hasText) throw noTextLayerError(probe);

      const outPath = join(ctx.scratchDir, `${base}.md`);
      ctx.report(15, "Converting to Markdown");
      const result = await pdfToMarkdownPy(inPath, outPath, { signal: ctx.signal });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.md`,
        contentType: "text/markdown",
        resultPayload: { chars: result.chars },
      };
    },
  });
}
