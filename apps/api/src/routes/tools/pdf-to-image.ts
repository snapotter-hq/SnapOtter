import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import * as mupdf from "mupdf";
import sharp from "sharp";
import { z } from "zod";
import { createWorkspace } from "../../lib/workspace.js";

// ── Settings schema ──────────────────────────────────────────────
const settingsSchema = z.object({
  format: z.enum(["png", "jpg", "webp", "avif", "tiff"]).default("png"),
  dpi: z.union([z.literal(72), z.literal(150), z.literal(300), z.literal(600)]).default(150),
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
};

function convertWithSharp(pngBuffer: Uint8Array, format: string): Promise<Buffer> {
  const s = sharp(Buffer.from(pngBuffer));
  switch (format) {
    case "jpg":
      return s.jpeg().toBuffer();
    case "webp":
      return s.webp().toBuffer();
    case "avif":
      return s.avif().toBuffer();
    case "tiff":
      return s.tiff().toBuffer();
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

// ── Route registration ───────────────────────────────────────────
export function registerPdfToImage(app: FastifyInstance) {
  // ── Info endpoint ────────────────────────────────────────────
  app.post("/api/v1/tools/pdf-to-image/info", async (request, reply) => {
    let fileBuffer: Buffer | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
        }
      }
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

  // ── Main processing endpoint ─────────────────────────────────
  app.post("/api/v1/tools/pdf-to-image", async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    let settingsRaw: string | null = null;

    try {
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
        return reply.status(400).send({ error: "Invalid settings", details: result.error.issues });
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

      // ── Single page: workspace + JSON response ─────────────
      if (selectedPages.length === 1) {
        const pageNum = selectedPages[0];
        const pngBytes = renderPage(doc, pageNum - 1, settings.dpi);
        doc.destroy();
        doc = null;

        const imageBuffer = await convertWithSharp(pngBytes, settings.format);

        const jobId = randomUUID();
        const workspacePath = await createWorkspace(jobId);
        const filename = `page-${pageNum}${ext}`;
        await writeFile(join(workspacePath, "output", filename), imageBuffer);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
          pageCount: totalPages,
          selectedPages,
          format: settings.format,
        });
      }

      // ── Multiple pages: stream ZIP ─────────────────────────
      const jobId = randomUUID();

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="pdf-pages-${jobId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
      });

      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.pipe(reply.raw);

      for (const pageNum of selectedPages) {
        const pngBytes = renderPage(doc, pageNum - 1, settings.dpi);
        const imageBuffer = await convertWithSharp(pngBytes, settings.format);
        archive.append(imageBuffer, { name: `page-${pageNum}${ext}` });
      }

      doc.destroy();
      doc = null;

      await archive.finalize();
    } catch (err) {
      doc?.destroy();
      if (!reply.raw.headersSent) {
        return reply.status(422).send({
          error: "PDF conversion failed",
          details: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  });
}
