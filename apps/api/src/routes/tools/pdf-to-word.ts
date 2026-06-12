import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfToWordPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
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

      const outPath = join(ctx.scratchDir, `${base}.docx`);
      ctx.report(10, "Converting");
      await pdfToWordPy(inPath, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.docx`,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    },
  });
}
