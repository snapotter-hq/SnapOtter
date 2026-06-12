import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfRepair } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerRepairPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "repair-pdf",
    settingsSchema,
    skipStructuralValidation: true,
    process: async () => {
      throw new Error("repair-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_repaired.pdf`);
      ctx.report(10, "Repairing");
      await qpdfRepair(inPath, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_repaired.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
