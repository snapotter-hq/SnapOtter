import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { convertFontPy } from "@snapotter/doc-engine";
import { FONT_FORMATS, type FontFormat } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  format: z.enum(FONT_FORMATS).default("ttf"),
});

const CONTENT_TYPES: Record<FontFormat, string> = {
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

// sfnt version tags: TrueType (two spellings), CFF, WOFF and WOFF2.
const FONT_MAGIC = [Buffer.from([0, 1, 0, 0]).toString("latin1"), "true", "OTTO", "wOFF", "wOF2"];

/** Reject a non-font before a job is queued; the script re-checks it anyway. */
export function assertFontMagic(buffer: Buffer): void {
  const magic = buffer.subarray(0, 4).toString("latin1");
  if (magic === "ttcf") {
    throw new InputValidationError(
      "Font collections (.ttc) aren't supported. Extract a single font first.",
    );
  }
  if (!FONT_MAGIC.includes(magic)) {
    throw new InputValidationError("This file isn't a TTF, OTF, WOFF or WOFF2 font.");
  }
}

export function registerConvertFont(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert-font",
    settingsSchema,
    preValidate: ({ inputs }) => {
      for (const input of inputs) assertFontMagic(input.buffer);
    },
    process: async () => {
      throw new Error("convert-font is v2-only");
    },
    processV2: async (ctx) => {
      const { format } = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      assertFontMagic(input.buffer);
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const filename = `${base}.${format}`;
      const outPath = join(ctx.scratchDir, `out.${format}`);
      ctx.report(10, "Converting");
      await convertFontPy(inPath, outPath, format, { signal: ctx.signal });
      ctx.report(90, "Done");

      return { scratchPath: outPath, filename, contentType: CONTENT_TYPES[format] };
    },
  });
}
