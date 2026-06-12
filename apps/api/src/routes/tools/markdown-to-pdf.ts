import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { htmlToPdfPy } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerMarkdownToPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "markdown-to-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("markdown-to-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}.pdf`);
      ctx.report(10, "Converting");
      await htmlToPdfPy(inPath, outPath, "markdown");
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
