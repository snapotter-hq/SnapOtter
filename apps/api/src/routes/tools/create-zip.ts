import { createWriteStream } from "node:fs";
import { extname, join } from "node:path";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({});

export function registerCreateZip(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "create-zip",
    maxInputs: 50,
    minInputs: 2,
    settingsSchema,
    process: async () => {
      throw new Error("create-zip is v2-only");
    },
    processV2: async (ctx) => {
      if (ctx.inputs.length < 2) {
        throw new InputValidationError("Zipping needs at least two files");
      }

      // Deduplicate output names: append -1, -2, ... until unique. Checking the
      // generated name (not just the input name) avoids collisions when an input
      // is literally named like a generated one (e.g. file.txt, file.txt, file-1.txt).
      const usedNames = new Set<string>();
      const entryNames: string[] = [];
      for (const input of ctx.inputs) {
        const ext = extname(input.filename);
        const base = input.filename.slice(0, input.filename.length - ext.length) || "file";
        let name = input.filename;
        let n = 1;
        while (usedNames.has(name.toLowerCase())) {
          name = `${base}-${n}${ext}`;
          n++;
        }
        usedNames.add(name.toLowerCase());
        entryNames.push(name);
      }

      const zipPath = join(ctx.scratchDir, "archive.zip");
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 6 } });
        output.on("close", () => resolve());
        archive.on("error", (err: Error) => reject(err));
        archive.pipe(output);
        for (let i = 0; i < ctx.inputs.length; i++) {
          archive.append(ctx.inputs[i].buffer, { name: entryNames[i] });
          const pct = Math.min(90, 10 + Math.round(((i + 1) / ctx.inputs.length) * 80));
          ctx.report(pct, `Adding file ${i + 1} of ${ctx.inputs.length}`);
        }
        void archive.finalize();
      });

      return {
        scratchPath: zipPath,
        filename: "archive.zip",
        contentType: "application/zip",
      };
    },
  });
}
