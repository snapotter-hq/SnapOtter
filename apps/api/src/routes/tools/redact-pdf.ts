import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdfRedactPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  terms: z.array(z.string().min(1).max(200)).min(1).max(50),
  caseSensitive: z.boolean().default(false),
});

export function registerRedactPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "redact-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("redact-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_redacted.pdf`);
      ctx.report(10, "Redacting");
      const { found } = await pdfRedactPy(inPath, outPath, settings.terms, settings.caseSensitive);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_redacted.pdf`,
        contentType: "application/pdf",
        resultPayload: { found },
      };
    },
  });
}
