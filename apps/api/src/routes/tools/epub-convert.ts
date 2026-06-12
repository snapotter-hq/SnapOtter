import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { htmlToPdfPy, runPandoc } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  md: "text/markdown",
};

const settingsSchema = z.object({
  format: z.enum(["pdf", "docx", "html", "md"]),
});

export function registerEpubConvert(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "epub-convert",
    settingsSchema,
    process: async () => {
      throw new Error("epub-convert is v2-only");
    },
    processV2: async (ctx) => {
      const settings = ctx.settings as z.infer<typeof settingsSchema>;
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const { format } = settings;
      ctx.report(10, "Converting");

      if (format === "pdf") {
        // Two-step chain: epub -> standalone HTML -> PDF via WeasyPrint.
        // Resource embedding MUST stay OFF: pandoc --self-contained / --embed-resources
        // would fetch remote refs server-side (SSRF). The weasyprint bridge pre-scan
        // enforces remote-ref rejection so the PDF path fails safely on remote content.
        const intermediateHtml = join(ctx.scratchDir, "book.html");
        await runPandoc(inPath, intermediateHtml, { extraArgs: ["--standalone"] });
        const outPath = join(ctx.scratchDir, `${base}.pdf`);
        await htmlToPdfPy(intermediateHtml, outPath, "html");
        ctx.report(90, "Done");
        return {
          scratchPath: outPath,
          filename: `${base}.pdf`,
          contentType: CONTENT_TYPES.pdf,
        };
      }

      // Direct pandoc conversion for docx, html, md
      const outPath = join(ctx.scratchDir, `${base}.${format}`);
      await runPandoc(inPath, outPath, format === "html" ? { extraArgs: ["--standalone"] } : {});
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.${format}`,
        contentType: CONTENT_TYPES[format],
      };
    },
  });
}
