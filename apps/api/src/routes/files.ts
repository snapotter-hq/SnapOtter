import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { createWorkspace, getWorkspacePath } from "../lib/workspace.js";
import { requirePermission } from "../permissions.js";

/**
 * Guard against path traversal in URL params.
 */
function isPathTraversal(segment: string): boolean {
  return (
    segment.includes("..") ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0")
  );
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/v1/upload ────────────────────────────────────────
  app.post("/api/v1/upload", async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requirePermission("tools:use")(request, reply);
    if (!user) return;

    const jobId = randomUUID();
    const workspacePath = await createWorkspace(jobId);
    const inputDir = join(workspacePath, "input");

    const uploadedFiles: Array<{
      name: string;
      size: number;
      format: string;
    }> = [];

    const parts = request.parts();

    for await (const part of parts) {
      // Skip non-file fields
      if (part.type !== "file") continue;

      // Consume buffer from the stream
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      // Skip empty parts (e.g. empty file field)
      if (buffer.length === 0) continue;

      // Validate the image
      const validation = await validateImageBuffer(buffer);
      if (!validation.valid) {
        return reply.status(400).send({
          error: `Invalid file "${part.filename}": ${validation.reason}`,
        });
      }

      // Sanitize filename
      const safeName = sanitizeFilename(part.filename ?? "upload");

      // Write to workspace input directory
      const filePath = join(inputDir, safeName);
      await writeFile(filePath, buffer);

      uploadedFiles.push({
        name: safeName,
        size: buffer.length,
        format: validation.format,
      });
    }

    if (uploadedFiles.length === 0) {
      return reply.status(400).send({ error: "No valid files uploaded" });
    }

    return reply.send({
      jobId,
      files: uploadedFiles,
    });
  });

  // ── GET /api/v1/download/:jobId/:filename ──────────────────────
  app.get(
    "/api/v1/download/:jobId/:filename",
    async (
      request: FastifyRequest<{
        Params: { jobId: string; filename: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { jobId, filename } = request.params;

      // Guard against path traversal
      if (isPathTraversal(jobId) || isPathTraversal(filename)) {
        return reply.status(400).send({ error: "Invalid path" });
      }

      const workspacePath = getWorkspacePath(jobId);

      // Try output directory first, then input
      let filePath = join(workspacePath, "output", filename);
      try {
        await stat(filePath);
      } catch {
        filePath = join(workspacePath, "input", filename);
        try {
          await stat(filePath);
        } catch {
          return reply.status(404).send({ error: "File not found" });
        }
      }

      const buffer = await readFile(filePath);
      const ext = extname(filename).toLowerCase().replace(/^\./, "");
      const contentType = getContentType(ext);

      return reply
        .header("Content-Type", contentType)
        .header("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`)
        .send(buffer);
    },
  );
}

function getContentType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    avif: "image/avif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
    ico: "image/x-icon",
    json: "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}
