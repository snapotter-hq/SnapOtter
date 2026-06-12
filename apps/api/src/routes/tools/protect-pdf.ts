import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfEncrypt } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  userPassword: z.string().min(1).max(256),
  ownerPassword: z.string().min(1).max(256).optional(),
});

export function registerProtectPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "protect-pdf",
    settingsSchema,
    redactSettingsForAudit: (settings) => {
      const s = settings as z.infer<typeof settingsSchema>;
      return {
        ...s,
        userPassword: "<redacted>",
        ownerPassword: "<redacted>",
      };
    },
    process: async () => {
      throw new Error("protect-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_protected.pdf`);
      ctx.report(10, "Encrypting");
      await qpdfEncrypt(
        inPath,
        settings.userPassword,
        settings.ownerPassword ?? settings.userPassword,
        outPath,
      );
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_protected.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
