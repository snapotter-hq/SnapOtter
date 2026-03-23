import { z } from "zod";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";

const settingsSchema = z.object({
  pattern: z.string().min(1).max(200).default("image-{{index}}"),
  startIndex: z.number().min(0).default(1),
});

/**
 * Bulk rename files with a pattern and return as ZIP.
 * No image processing - just renames.
 */
export function registerBulkRename(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/bulk-rename",
    async (request, reply) => {
      const files: Array<{ buffer: Buffer; filename: string }> = [];
      let settingsRaw: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            const buf = Buffer.concat(chunks);
            if (buf.length > 0) {
              files.push({
                buffer: buf,
                filename: basename(part.filename ?? `file-${files.length}`),
              });
            }
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (files.length === 0) {
        return reply.status(400).send({ error: "No files provided" });
      }

      let settings: z.infer<typeof settingsSchema>;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply.status(400).send({ error: "Invalid settings", details: result.error.issues });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      try {
        const jobId = randomUUID();

        reply.raw.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="renamed-${jobId.slice(0, 8)}.zip"`,
          "Transfer-Encoding": "chunked",
        });

        const archive = archiver("zip", { zlib: { level: 5 } });
        archive.pipe(reply.raw);

        for (let i = 0; i < files.length; i++) {
          const ext = extname(files[i].filename);
          const index = settings.startIndex + i;
          const padded = String(index).padStart(String(files.length + settings.startIndex).length, "0");
          const newName =
            settings.pattern
              .replace(/\{\{index\}\}/g, String(index))
              .replace(/\{\{padded\}\}/g, padded)
              .replace(/\{\{original\}\}/g, files[i].filename.replace(ext, "")) +
            ext;

          archive.append(files[i].buffer, { name: basename(newName) });
        }

        await archive.finalize();
      } catch (err) {
        if (!reply.raw.headersSent) {
          return reply.status(422).send({
            error: "Rename failed",
            details: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    },
  );
}
