import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { readImageDimensions } from "../lib/exiftool.js";
import { validateImageBuffer } from "../lib/file-validation.js";
import { sanitizeFilename } from "../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../lib/format-decoders.js";
import { decodeHeic } from "../lib/heic-converter.js";
import { getObjectSize, getObjectStream, putObject } from "../lib/object-storage.js";
import { isSvgBuffer, sanitizeSvg } from "../lib/svg-sanitize.js";

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
  app.post(
    "/api/v1/upload",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const jobId = randomUUID();

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

        // Try image validation; non-image files are accepted with format from extension
        const validation = await validateImageBuffer(buffer, part.filename).catch(() => null);
        const isValidImage = validation?.valid === true;

        // Sanitize SVG uploads to prevent XXE, SSRF, and script injection
        const safeBuffer = isValidImage && isSvgBuffer(buffer) ? sanitizeSvg(buffer) : buffer;

        // Sanitize filename (canonical; do NOT re-sanitize downstream)
        const safeName = sanitizeFilename(part.filename ?? "upload");

        // Write to object storage uploads prefix
        await putObject(`uploads/${jobId}/${safeName}`, safeBuffer);

        const fileExt = safeName.split(".").pop()?.toLowerCase() ?? "";
        uploadedFiles.push({
          name: safeName,
          size: safeBuffer.length,
          format: isValidImage ? validation.format : fileExt,
        });
      }

      if (uploadedFiles.length === 0) {
        return reply.status(400).send({ error: "No valid files uploaded" });
      }

      return reply.send({
        jobId,
        files: uploadedFiles,
      });
    },
  );

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

      // Resolve from object storage: outputs/ first, then uploads/
      let key = `outputs/${jobId}/${filename}`;
      let size: number;
      try {
        size = await getObjectSize(key);
      } catch {
        key = `uploads/${jobId}/${filename}`;
        try {
          size = await getObjectSize(key);
        } catch {
          return reply.status(404).send({ error: "File not found" });
        }
      }

      const ext = extname(filename).toLowerCase().replace(/^\./, "");
      const contentType = getContentType(ext);

      // Check Range header before setting content headers (a 416 must not
      // carry the attachment Content-Type that would confuse serialization).
      reply.header("Accept-Ranges", "bytes");

      const range = request.headers.range;
      if (range) {
        const m = range.match(/^bytes=(\d+)-(\d*)$/);
        const start = m ? Number.parseInt(m[1], 10) : Number.NaN;
        const end = m?.[2] ? Number.parseInt(m[2], 10) : size - 1;
        if (!m || Number.isNaN(start) || start >= size || end < start) {
          return reply
            .code(416)
            .header("Content-Range", `bytes */${size}`)
            .send({ error: "Range not satisfiable" });
        }
        const clampedEnd = Math.min(end, size - 1);
        return reply
          .code(206)
          .header("Content-Type", contentType)
          .header(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          )
          .header("Content-Range", `bytes ${start}-${clampedEnd}/${size}`)
          .header("Content-Length", String(clampedEnd - start + 1))
          .send(await getObjectStream(key, { start, end: clampedEnd }));
      }

      reply
        .header("Content-Type", contentType)
        .header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        )
        .header("Content-Length", String(size));
      return reply.send(await getObjectStream(key));
    },
  );

  // ── POST /api/v1/preview ──────────────────────────────────────
  // Returns a WebP preview for formats browsers can't display (HEIC/HEIF).
  app.post("/api/v1/preview", async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: "No file provided" });
    }
    const originalBuffer = await data.toBuffer();
    let buffer = originalBuffer;
    const ext = data.filename?.split(".").pop()?.toLowerCase();

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
        // CLI decoder unavailable -- try Sharp directly as fallback for preview
        try {
          await sharp(buffer).metadata();
        } catch {
          return reply.status(422).send({
            error: `Failed to decode ${validation.format.toUpperCase()} file`,
          });
        }
      }
    }

    try {
      const preMeta = await sharp(buffer).metadata();
      let origWidth = preMeta.width ?? 0;
      let origHeight = preMeta.height ?? 0;

      if (validation.format === "raw") {
        const dims = await readImageDimensions(originalBuffer, ext);
        if (dims) {
          origWidth = dims.width;
          origHeight = dims.height;
        }
      }

      const webp = await sharp(buffer)
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      return reply
        .header("Content-Type", "image/webp")
        .header("X-Original-Width", String(origWidth))
        .header("X-Original-Height", String(origHeight))
        .send(webp);
    } catch {
      return reply.status(422).send({
        error: `Failed to generate preview for ${validation.format.toUpperCase()} file`,
      });
    }
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
