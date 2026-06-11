import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfMerge } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerMergePdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "merge-pdf",
    maxInputs: 20,
    settingsSchema,
    process: async () => {
      throw new Error("merge-pdf is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length < 2) {
        throw new Error("Merging needs at least two PDFs");
      }
      ctx.report(10, "Staging");
      const paths: string[] = [];
      for (let i = 0; i < ctx.inputs.length; i++) {
        const p = join(ctx.scratchDir, `in-${i}.pdf`);
        await writeFile(p, ctx.inputs[i].buffer);
        paths.push(p);
      }
      const outPath = join(ctx.scratchDir, "merged.pdf");
      ctx.report(40, "Merging");
      await qpdfMerge(paths, outPath);
      return { scratchPath: outPath, filename: "merged.pdf", contentType: "application/pdf" };
    },
  });
}
