import { writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { convertDocument } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config.js";
import { createToolRoute } from "../tool-factory.js";

const CONTENT_TYPES: Record<string, string> = {
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odp: "application/vnd.oasis.opendocument.presentation",
};

const settingsSchema = z.object({
  format: z.enum(["pptx", "odp"]),
});

export function registerConvertPresentation(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert-presentation",
    settingsSchema,
    process: async () => {
      throw new Error("convert-presentation is v2-only");
    },
    processV2: async (ctx) => {
      const settings = ctx.settings as z.infer<typeof settingsSchema>;
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");

      const inputExt = extname(input.filename).toLowerCase();
      if (inputExt === `.${settings.format}`) {
        ctx.report(90, "Done");
        return {
          buffer: input.buffer,
          filename: `${base}.${settings.format}`,
          contentType: CONTENT_TYPES[settings.format],
        };
      }

      // Preserve the real extension so LibreOffice can sniff the input format.
      const sanitized = input.filename.replace(/[^A-Za-z0-9._-]/g, "_");
      const inPath = join(ctx.scratchDir, `in-${sanitized}`);
      await writeFile(inPath, input.buffer);

      ctx.report(10, "Converting");
      const outPath = await convertDocument(inPath, ctx.scratchDir, settings.format, {
        timeoutMs: (env.LIBREOFFICE_TIMEOUT_S || 120) * 1000,
      });
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}.${settings.format}`,
        contentType: CONTENT_TYPES[settings.format],
      };
    },
  });
}
