import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import * as mupdf from "mupdf";
import sharp from "sharp";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { encodeHeic } from "../../lib/heic-converter.js";
import { createWorkspace } from "../../lib/workspace.js";

// ── Settings schema ──────────────────────────────────────────────
const settingsSchema = z.object({
  format: z.enum(["png", "jpg", "webp", "avif", "tiff", "gif", "heic", "heif"]).default("png"),
  dpi: z.number().min(36).max(2400).default(150),
  quality: z.number().min(1).max(100).default(85),
  colorMode: z.enum(["color", "grayscale", "bw"]).default("color"),
  pages: z.string().default("all"),
});

// ── Page range parser (exported for unit tests) ──────────────────
export function parsePageRange(input: string, totalPages: number): number[] {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "all") {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  const segments = trimmed.split(",");

  for (const segment of segments) {
    const seg = segment.trim();
    if (seg === "") {
      throw new Error("Invalid page range format");
    }

    if (seg.includes("-")) {
      const [startStr, endStr] = seg.split("-").map((s) => s.trim());
      const start = Number(startStr);
      const end = Number(endStr);

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new Error("Invalid page range format");
      }
      if (start < 1 || end < 1) {
        throw new Error("Page numbers must be positive");
      }
      if (start > end) {
        throw new Error("Invalid page range: start exceeds end");
      }
      if (end > totalPages) {
        throw new Error(`Page(s) ${end} out of range (document has ${totalPages} pages)`);
      }

      for (let i = start; i <= end; i++) {
        pages.add(i);
      }
    } else {
      const page = Number(seg);
      if (!Number.isInteger(page)) {
        throw new Error("Invalid page range format");
      }
      if (page < 1) {
        throw new Error("Page numbers must be positive");
      }
      if (page > totalPages) {
        throw new Error(`Page(s) ${page} out of range (document has ${totalPages} pages)`);
      }
      pages.add(page);
    }
  }

  return [...pages].sort((a, b) => a - b);
}

// ── Sharp format mapping ─────────────────────────────────────────
const FORMAT_EXT: Record<string, string> = {
  png: ".png",
  jpg: ".jpg",
  webp: ".webp",
  avif: ".avif",
  tiff: ".tiff",
  gif: ".gif",
  heic: ".heic",
  heif: ".heif",
};

async function convertWithSharp(
  pngBuffer: Uint8Array,
  format: string,
  quality: number,
  colorMode: string,
): Promise<Buffer> {
  let s = sharp(Buffer.from(pngBuffer));

  // Apply color mode before format conversion
  if (colorMode === "grayscale") {
    s = s.grayscale();
  } else if (colorMode === "bw") {
    s = s.grayscale().threshold(128);
  }

  switch (format) {
    case "jpg":
      return s.jpeg({ quality }).toBuffer();
    case "webp":
      return s.webp({ quality }).toBuffer();
    case "avif":
      return s.avif({ quality }).toBuffer();
    case "tiff":
      return s.tiff().toBuffer();
    case "gif":
      return s.gif().toBuffer();
    case "heic":
    case "heif": {
      const pngBuf = await s.png().toBuffer();
      return encodeHeic(pngBuf, quality);
    }
    default:
      return s.png().toBuffer();
  }
}

// ── Render a single page ─────────────────────────────────────────
function renderPage(doc: mupdf.Document, pageIndex: number, dpi: number): Uint8Array {
  const page = doc.loadPage(pageIndex);
  try {
    const scale = dpi / 72;
    const pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    try {
      return pixmap.asPNG();
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

// ── Helper: read multipart PDF file ──────────────────────────────
async function readPdfFromParts(
  request: import("fastify").FastifyRequest,
): Promise<{ fileBuffer: Buffer | null; settingsRaw: string | null }> {
  let fileBuffer: Buffer | null = null;
  let settingsRaw: string | null = null;
  const parts = request.parts();
  for await (const part of parts) {
    if (part.type === "file") {
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(chunk);
      }
      fileBuffer = Buffer.concat(chunks);
    } else if (part.fieldname === "settings") {
      settingsRaw = part.value as string;
    }
  }
  return { fileBuffer, settingsRaw };
}

// ── Route registration ───────────────────────────────────────────
export function registerPdfToImage(app: FastifyInstance) {
  // ── Info endpoint ────────────────────────────────────────────
  app.post("/api/v1/tools/pdf-to-image/info", async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    try {
      const result = await readPdfFromParts(request);
      fileBuffer = result.fileBuffer;
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No PDF file provided" });
    }

    let doc: mupdf.Document | null = null;
    try {
      doc = mupdf.Document.openDocument(fileBuffer, "application/pdf");
      if (doc.needsPassword()) {
        return reply.status(400).send({ error: "Password-protected PDFs are not supported" });
      }
      const pageCount = doc.countPages();
      return reply.send({ pageCount });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("password") || err.message.includes("Password"))
      ) {
        return reply.status(400).send({ error: "Password-protected PDFs are not supported" });
      }
      return reply.status(400).send({ error: "Invalid or corrupt PDF file" });
    } finally {
      doc?.destroy();
    }
  });

  // ── Preview endpoint (thumbnails) ─────────────────────────────
  app.post("/api/v1/tools/pdf-to-image/preview", async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    try {
      const result = await readPdfFromParts(request);
      fileBuffer = result.fileBuffer;
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No PDF file provided" });
    }

    let doc: mupdf.Document | null = null;
    try {
      doc = mupdf.Document.openDocument(fileBuffer, "application/pdf");
      if (doc.needsPassword()) {
        return reply.status(400).send({ error: "Password-protected PDFs are not supported" });
      }
      const pageCount = doc.countPages();
      const maxPages = Math.min(pageCount, 200);
      const thumbnails: Array<{
        page: number;
        dataUrl: string;
        width: number;
        height: number;
      }> = [];

      for (let i = 0; i < maxPages; i++) {
        const pngBytes = renderPage(doc, i, 72);
        const thumb = await sharp(Buffer.from(pngBytes))
          .resize({ width: 300, withoutEnlargement: true })
          .jpeg({ quality: 60 })
          .toBuffer();
        const meta = await sharp(thumb).metadata();
        thumbnails.push({
          page: i + 1,
          dataUrl: `data:image/jpeg;base64,${thumb.toString("base64")}`,
          width: meta.width ?? 0,
          height: meta.height ?? 0,
        });
      }

      return reply.send({ pageCount, thumbnails });
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("password") || err.message.includes("Password"))
      ) {
        return reply.status(400).send({ error: "Password-protected PDFs are not supported" });
      }
      return reply.status(400).send({ error: "Invalid or corrupt PDF file" });
    } finally {
      doc?.destroy();
    }
  });

  // ── Main processing endpoint ─────────────────────────────────
  app.post("/api/v1/tools/pdf-to-image", async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    let settingsRaw: string | null = null;

    try {
      const result = await readPdfFromParts(request);
      fileBuffer = result.fileBuffer;
      settingsRaw = result.settingsRaw;
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No PDF file provided" });
    }

    let settings: z.infer<typeof settingsSchema>;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply
          .status(400)
          .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    let doc: mupdf.Document | null = null;
    try {
      doc = mupdf.Document.openDocument(fileBuffer, "application/pdf");
      if (doc.needsPassword()) {
        return reply.status(400).send({ error: "Password-protected PDFs are not supported" });
      }

      const totalPages = doc.countPages();

      let selectedPages: number[];
      try {
        selectedPages = parsePageRange(settings.pages, totalPages);
      } catch (err) {
        return reply
          .status(400)
          .send({ error: err instanceof Error ? err.message : "Invalid page range" });
      }

      const ext = FORMAT_EXT[settings.format] ?? ".png";
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);
      const outputDir = join(workspacePath, "output");
      const pages: Array<{ page: number; downloadUrl: string; size: number }> = [];

      for (const pageNum of selectedPages) {
        const pngBytes = renderPage(doc, pageNum - 1, settings.dpi);
        const imageBuffer = await convertWithSharp(
          pngBytes,
          settings.format,
          settings.quality,
          settings.colorMode,
        );
        const filename = `page-${pageNum}${ext}`;
        const filePath = join(outputDir, filename);
        await writeFile(filePath, imageBuffer);
        pages.push({
          page: pageNum,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
          size: imageBuffer.length,
        });
      }

      doc.destroy();
      doc = null;

      // Generate ZIP
      const zipFilename = "pdf-pages.zip";
      const zipPath = join(outputDir, zipFilename);
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver("zip", { zlib: { level: 5 } });
        output.on("close", resolve);
        archive.on("error", reject);
        archive.pipe(output);
        for (const p of pages) {
          const fname = `page-${p.page}${ext}`;
          archive.file(join(outputDir, fname), { name: fname });
        }
        archive.finalize();
      });

      const zipStat = await stat(zipPath);

      return reply.send({
        jobId,
        pageCount: totalPages,
        selectedPages,
        format: settings.format,
        pages,
        zipUrl: `/api/v1/download/${jobId}/${encodeURIComponent(zipFilename)}`,
        zipSize: zipStat.size,
      });
    } catch (err) {
      doc?.destroy();
      return reply.status(422).send({
        error: "PDF conversion failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
