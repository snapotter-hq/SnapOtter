import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runPandoc } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerMarkdownToHtml(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "markdown-to-html",
    settingsSchema,
    process: async () => {
      throw new Error("markdown-to-html is v2-only");
    },
    processV2: async (ctx) => {
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}.html`);
      ctx.report(10, "Converting");
      await runPandoc(inPath, outPath, { extraArgs: ["--standalone"] });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.html`,
        contentType: "text/html",
      };
    },
  });
}
