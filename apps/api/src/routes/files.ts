import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { isSvgBuffer, sanitizeSvg } from "../lib/svg-sanitize.js";
import { createWorkspace, getWorkspacePath } from "../lib/workspace.js";

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

      // Validate the image (pass filename for extension-based format detection)
      const validation = await validateImageBuffer(buffer, part.filename);
      if (!validation.valid) {
        return reply.status(400).send({
          error: `Invalid file "${part.filename}": ${validation.reason}`,
        });
      }

      // Sanitize SVG uploads to prevent XXE, SSRF, and script injection
      const safeBuffer = isSvgBuffer(buffer) ? sanitizeSvg(buffer) : buffer;

      // Sanitize filename
      const safeName = sanitizeFilename(part.filename ?? "upload");

      // Write to workspace input directory
      const filePath = join(inputDir, safeName);
      await writeFile(filePath, safeBuffer);

      uploadedFiles.push({
        name: safeName,
        size: safeBuffer.length,
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

  // ── POST /api/v1/preview ──────────────────────────────────────
  // Returns a WebP preview for formats browsers can't display (HEIC/HEIF).
  app.post("/api/v1/preview", async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }
    let buffer = await data.toBuffer();

    const validation = await validateImageBuffer(buffer, data.filename);
    if (!validation.valid) {
      return reply.status(400).send({ error: validation.reason });
    }

    // Decode HEIC/HEIF via system decoder
    if (validation.format === "heif") {
      try {
        buffer = await decodeHeic(buffer);
      } catch {
        return reply.status(422).send({ error: "Failed to decode HEIC/HEIF file" });
      }
    }

    // Decode CLI-decoded formats (RAW, PSD, TGA, EXR, HDR) via external tools
    if (needsCliDecode(validation.format)) {
      try {
        buffer = await decodeToSharpCompat(buffer, validation.format);
      } catch {
        return reply.status(422).send({
          error: `Failed to decode ${validation.format.toUpperCase()} file`,
        });
      }
    }

    const webp = await sharp(buffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return reply.header("Content-Type", "image/webp").send(webp);
  });
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
    jxl: "image/jxl",
    dng: "image/x-adobe-dng",
    cr2: "image/x-canon-cr2",
    nef: "image/x-nikon-nef",
    arw: "image/x-sony-arw",
    orf: "image/x-olympus-orf",
    rw2: "image/x-panasonic-rw2",
    tga: "image/x-tga",
    psd: "image/vnd.adobe.photoshop",
    exr: "image/x-exr",
    hdr: "image/vnd.radiance",
    heic: "image/heic",
    heif: "image/heif",
  };
  return map[ext] ?? "application/octet-stream";
}
