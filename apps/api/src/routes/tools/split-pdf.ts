import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfPageCount, qpdfSplitRanges } from "@snapotter/doc-engine";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z
  .object({
    mode: z.enum(["range", "every"]).default("range"),
    range: z
      .string()
      .max(200)
      .regex(/^[0-9rz][0-9rz,-]*$/i, "Invalid page range")
      .optional(),
    everyN: z.number().int().min(1).max(500).optional(),
  })
  .refine(
    (s) => {
      if (s.mode === "range") return !!s.range;
      return s.everyN !== undefined;
    },
    { message: "range required for range mode; everyN required for every mode" },
  );

export function registerSplitPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "split-pdf",
    settingsSchema,
    process: async () => {
      throw new Error("split-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      if (settings.mode === "range") {
        const outPath = join(ctx.scratchDir, `${base}_pages.pdf`);
        ctx.report(20, "Extracting pages");
        await qpdfSplitRanges(inPath, settings.range ?? "", outPath);
        return {
          scratchPath: outPath,
          filename: `${base}_pages.pdf`,
          contentType: "application/pdf",
        };
      }

      // mode === "every": split into chunks of everyN pages
      const totalPages = await qpdfPageCount(inPath);
      const n = settings.everyN ?? 1;
      const parts: string[] = [];
      for (let start = 1; start <= totalPages; start += n) {
        const end = Math.min(start + n - 1, totalPages);
        const partPath = join(ctx.scratchDir, `part-${parts.length + 1}.pdf`);
        const range = `${start}-${end}`;
        await qpdfSplitRanges(inPath, range, partPath);
        parts.push(partPath);
        const pct = Math.min(80, 10 + Math.round((start / totalPages) * 70));
        ctx.report(pct, `Splitting part ${parts.length}`);
      }

      // Zip the parts
      ctx.report(85, "Creating archive");
      const zipPath = join(ctx.scratchDir, `${base}_parts.zip`);
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 5 } });
        output.on("close", () => resolve());
        archive.on("error", (err: Error) => reject(err));
        archive.pipe(output);
        for (let i = 0; i < parts.length; i++) {
          archive.file(parts[i], { name: `part-${i + 1}.pdf` });
        }
        void archive.finalize();
      });

      return {
        scratchPath: zipPath,
        filename: `${base}_parts.zip`,
        contentType: "application/zip",
      };
    },
  });
}
