import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfTextPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerPdfToText(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "pdf-to-text",
    settingsSchema,
    process: async () => {
      throw new Error("pdf-to-text is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}.txt`);
      ctx.report(10, "Extracting text");
      const result = await pdfTextPy(inPath, outPath);
      // A scanned or image-only PDF has no text layer, so extraction returns an
      // empty file. Rather than hand back a silent 0-byte "success", tell the
      // user to run OCR instead (#589).
      if (!result.hasText) {
        throw new InputValidationError(
          "This PDF has no extractable text layer. It looks scanned or image-only, so use the PDF OCR tool to read its text.",
          422,
        );
      }
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.txt`,
        contentType: "text/plain",
        resultPayload: { chars: result.chars },
      };
    },
  });
}
