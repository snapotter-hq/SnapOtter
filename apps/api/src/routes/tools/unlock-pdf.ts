import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { qpdfDecrypt, qpdfInputFault } from "@snapotter/doc-engine";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InputValidationError } from "../../modality/contract.js";
import { createToolRoute } from "../tool-factory.js";

const settingsSchema = z.object({
  password: z.string().min(1).max(256),
});

export function registerUnlockPdf(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "unlock-pdf",
    settingsSchema,
    // unlock-pdf's whole job is to decrypt: its input is an encrypted PDF plus
    // the password, so it must opt out of the factory's password-protected
    // rejection that every other document tool gets by default.
    allowPasswordProtectedPdf: true,
    redactSettingsForAudit: (settings) => {
      const s = settings as z.infer<typeof settingsSchema>;
      return {
        ...s,
        password: "<redacted>",
      };
    },
    process: async () => {
      throw new Error("unlock-pdf is v2-only");
    },
    processV2: async (ctx) => {
      const settings = settingsSchema.parse(ctx.settings);
      const input = ctx.inputs[0];
      const base = input.filename.replace(/\.[^.]+$/, "");
      const inPath = join(ctx.scratchDir, `in-${input.filename.replace(/[^A-Za-z0-9._-]/g, "_")}`);
      await writeFile(inPath, input.buffer);

      const outPath = join(ctx.scratchDir, `${base}_unlocked.pdf`);
      ctx.report(10, "Decrypting");
      try {
        await qpdfDecrypt(inPath, settings.password, outPath, { signal: ctx.signal });
      } catch (err) {
        if (qpdfInputFault(err) === "invalid-password") {
          throw new InputValidationError(
            "The password for this PDF isn't correct.",
            400,
            undefined,
            "INVALID_PASSWORD",
          );
        }
        throw err;
      }
      ctx.report(90, "Done");

      return {
        scratchPath: outPath,
        filename: `${base}_unlocked.pdf`,
        contentType: "application/pdf",
      };
    },
  });
}
