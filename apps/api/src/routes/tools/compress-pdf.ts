import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gsCompressPdf } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  preset: z.enum(["screen", "ebook", "printer"]).default("ebook"),
});

export function registerCompressPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "compress-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("compress-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_compressed.pdf`);
      ctx.report(10, "Compressing");
      await gsCompressPdf(inPath, outPath, settings.preset);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_compressed.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
