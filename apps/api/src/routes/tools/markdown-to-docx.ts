import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runPandoc } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerMarkdownToDocx(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "markdown-to-docx",
    settingsSchema,
    process: async () => {
      throw new Error("markdown-to-docx is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}.docx`);
      ctx.report(10, "Converting");
      await runPandoc(inPath, outPath);
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.docx`,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    },
  });
}
