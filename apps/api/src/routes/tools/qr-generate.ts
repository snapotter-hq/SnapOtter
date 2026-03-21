import { z } from "zod";
import QRCode from "qrcode";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorkspace } from "../../lib/workspace.js";

const settingsSchema = z.object({
  text: z.string().min(1).max(2000),
  size: z.number().min(100).max(2000).default(400),
  errorCorrection: z.enum(["L", "M", "Q", "H"]).default("M"),
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#000000"),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
});

/**
 * QR code generator - custom route (not factory) since it generates
 * images from text input, not from uploaded files.
 */
export function registerQrGenerate(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/qr-generate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      let body: unknown;
      try {
        body = request.body;
      } catch {
        return reply.status(400).send({ error: "Invalid request body" });
      }

      const result = settingsSchema.safeParse(body);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: result.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const settings = result.data;

      try {
        const buffer = await QRCode.toBuffer(settings.text, {
          width: settings.size,
          errorCorrectionLevel: settings.errorCorrection,
          color: {
            dark: settings.foreground,
            light: settings.background,
          },
          type: "png",
          margin: 2,
        });

        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);
        const filename = "qrcode.png";
        const outputPath = join(workspacePath, "output", filename);
        await writeFile(outputPath, buffer);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${filename}`,
          originalSize: 0,
          processedSize: buffer.length,
        });
      } catch (err) {
        return reply.status(422).send({
          error: "QR code generation failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  );
}
