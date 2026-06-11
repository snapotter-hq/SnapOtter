import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { convertDocument } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerWordToPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "word-to-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("word-to-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      // Sanitize the basename but keep the real extension so LibreOffice
      // can sniff the input format (e.g. .docx vs .odt vs .rtf).
      const sanitized = input.filename.replace(/[^A-Za-z0-9._-]/g, "_");
      const inPath = join(ctx.scratchDir, `in-${sanitized}`);
      await writeFile(inPath, input.buffer);

      ctx.report(10, "Converting");
      const outPath = await convertDocument(inPath, ctx.scratchDir, "pdf", {
        timeoutMs: (env.LIBREOFFICE_TIMEOUT_S || 120) * 1000,
      });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
