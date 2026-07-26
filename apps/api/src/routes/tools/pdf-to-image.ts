import { randomUUID } from "node:crypto";
import { apiToolPath } from "@snapotter/shared";
import archiver from "archiver";
import type { FastifyInstance } from "fastify";
import * as mupdf from "mupdf";
import sharp from "sharp";
import { z } from "zod";
import { env } from "../../config.js";
import { getSecurityHeaders } from "../../lib/csp.js";
import { formatZodErrors } from "../../lib/errors.js";
import { createUniqueNamer, sanitizeFilename } from "../../lib/filename.js";
import { encodeJxl } from "../../lib/format-encoders.js";
import { encodeHeic } from "../../lib/heic-converter.js";
import {
  deletePrefix,
  getObjectBuffer,
  getObjectStream,
  putObject,
} from "../../lib/object-storage.js";
import { requireToolAccess } from "../../permissions.js";
import { updateJobProgress } from "../progress.js";

// ── Settings schema ──────────────────────────────────────────────
const settingsSchema = z.object({
  format: z
    .enum(["png", "jpg", "webp", "avif", "tiff", "gif", "heic", "heif", "jxl"])
    .default("png"),
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
  jxl: ".jxl",
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
    case "jxl": {
      const pngBuf = await s.png().toBuffer();
      return encodeJxl(pngBuf, quality);
    }
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

// PDFs begin with "%PDF-" within the first bytes. mupdf.openDocument sniffs the
// real format and would otherwise accept non-PDF inputs (images, etc.),
// violating the .pdf-only contract; gate on the magic bytes up front.
function isPdfBuffer(buf: Buffer): boolean {
  return buf.subarray(0, 1024).includes("%PDF-");
}

/**
 * A caller-fixable problem with one document: it is locked, or the requested
 * page range does not fit it. Separated from render failures so the
 * single-file route answers 400 rather than 422, and so the batch route can
 * report the reason against the file that caused it.
 */
class PdfInputError extends Error {}

interface RenderedPages {
  pages: Array<{ page: number; downloadUrl: string; size: number }>;
  filenames: string[];
  totalPages: number;
  selectedPages: number[];
}

/**
 * Render the settings-selected pages of one PDF into `outputs/<jobId>/`.
 * Each page is written to storage as soon as it is encoded, so peak memory
 * stays at a single page no matter how long the document is.
 */
async function renderPdfPages(
  fileBuffer: Buffer,
  settings: z.infer<typeof settingsSchema>,
  jobId: string,
): Promise<RenderedPages> {
  let doc: mupdf.Document | null = null;
  try {
    doc = mupdf.Document.openDocument(fileBuffer, "application/pdf");
    if (doc.needsPassword()) {
      throw new PdfInputError("Password-protected PDFs are not supported");
    }

    const totalPages = doc.countPages();
    let selectedPages: number[];
    try {
      selectedPages = parsePageRange(settings.pages, totalPages);
    } catch (err) {
      throw new PdfInputError(err instanceof Error ? err.message : "Invalid page range");
    }

    // mupdf repairs and opens a document whose page tree is empty, which would
    // otherwise render nothing and hand back a valid but empty ZIP labelled a
    // success.
    if (selectedPages.length === 0) {
      throw new PdfInputError("This PDF has no pages to convert");
    }

    const ext = FORMAT_EXT[settings.format] ?? ".png";
    const pages: RenderedPages["pages"] = [];
    const filenames: string[] = [];

    for (const pageNum of selectedPages) {
      const pngBytes = renderPage(doc, pageNum - 1, settings.dpi);
      const imageBuffer = await convertWithSharp(
        pngBytes,
        settings.format,
        settings.quality,
        settings.colorMode,
      );
      const filename = `page-${pageNum}${ext}`;
      await putObject(`outputs/${jobId}/${filename}`, imageBuffer);
      filenames.push(filename);
      pages.push({
        page: pageNum,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(filename)}`,
        size: imageBuffer.length,
      });
    }

    return { pages, filenames, totalPages, selectedPages };
  } finally {
    doc?.destroy();
  }
}

/**
 * Zip one job's already-stored page images, reading a single entry at a time.
 * The finished archive is materialized in memory, so peak cost is one whole
 * document's worth of encoded pages.
 */
async function buildPagesZip(jobId: string, filenames: string[]): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 5 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", resolve);
    archive.on("error", reject);
  });
  for (const filename of filenames) {
    archive.append(await getObjectBuffer(`outputs/${jobId}/${filename}`), { name: filename });
  }
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

// ── Route registration ───────────────────────────────────────────
export function registerPdfToImageRoute(
  app: FastifyInstance,
  opts: { toolId: string; lockedFormat?: string },
) {
  const basePath = apiToolPath(opts.toolId);

  // ── Info endpoint ────────────────────────────────────────────
  app.post(`${basePath}/info`, async (request, reply) => {
    if (!(await requireToolAccess(request, reply, opts.toolId))) return;

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

    if (!isPdfBuffer(fileBuffer)) {
      return reply.status(400).send({ error: "Invalid or corrupt PDF file" });
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
  app.post(`${basePath}/preview`, async (request, reply) => {
    if (!(await requireToolAccess(request, reply, opts.toolId))) return;

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

    if (!isPdfBuffer(fileBuffer)) {
      return reply.status(400).send({ error: "Invalid or corrupt PDF file" });
    }

    let doc: mupdf.Document | null = null;
    try {
      doc = mupdf.Document.openDocument(fileBuffer, "application/pdf");
      if (doc.needsPassword()) {
        return reply.status(400).send({ error: "Password-protected PDFs are not supported" });
      }
      const pageCount = doc.countPages();
      const maxPages = env.MAX_PDF_PAGES > 0 ? Math.min(pageCount, env.MAX_PDF_PAGES) : pageCount;
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

  // ── Batch endpoint ───────────────────────────────────────────
  //
  // This literal path takes priority over the generic
  // `/api/v1/tools/:section/:toolId/batch` route, which only knows tools in
  // the createToolRoute/registerToolProcessFn registry. pdf-to-image and its
  // presets never register there, so without this they 404 the moment the web
  // client sends a second file (issue #632).
  //
  // One PDF fans out to many page images, so the per-file result is a ZIP,
  // matching what the single-file route already returns. The response is
  // therefore a ZIP of per-document ZIPs, one per input, in upload order.
  app.post(
    `${basePath}/batch`,
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      if (!(await requireToolAccess(request, reply, opts.toolId))) return;

      // Rasterizing several documents can outrun the default socket timeout.
      request.raw.socket?.setTimeout?.(0);

      const files: Array<{ buffer: Buffer; filename: string }> = [];
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;

      try {
        for await (const part of request.parts()) {
          if (part.type === "file") {
            const chunks: Buffer[] = [];
            for await (const chunk of part.file) {
              chunks.push(chunk);
            }
            // Empty parts keep their slot: the client maps results back onto
            // its own file list by index, so dropping one here would label a
            // converted document with a different file's name.
            files.push({
              buffer: Buffer.concat(chunks),
              filename: sanitizeFilename(part.filename ?? "document.pdf"),
            });
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          } else if (part.fieldname === "clientJobId") {
            // Doubles as an object-key segment and a response header value, so
            // anything outside the key charset is ignored rather than allowed
            // to fail every file or to break writeHead after hijack.
            const raw = part.value as string;
            if (typeof raw === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw)) {
              clientJobId = raw;
            }
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: err instanceof Error ? err.message : String(err),
        });
      }

      if (files.length === 0) {
        return reply.status(400).send({ error: "No PDF files provided" });
      }

      // Backstop only: the multipart iterator reads MAX_BATCH_SIZE per call and
      // busboy stops at the limit first, so this rarely fires.
      if (env.MAX_BATCH_SIZE > 0 && files.length > env.MAX_BATCH_SIZE) {
        return reply.status(400).send({
          error: `Too many files. Maximum batch size is ${env.MAX_BATCH_SIZE}`,
        });
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

      if (opts.lockedFormat) {
        settings.format = opts.lockedFormat as typeof settings.format;
      }

      const jobId = clientJobId || randomUUID();
      const results: Array<{ key: string; prefix: string; filename: string } | null> = new Array(
        files.length,
      ).fill(null);
      const errors: Array<{ filename: string; error: string }> = [];

      const publishProgress = (completedFiles: number, currentFile?: string) =>
        updateJobProgress({
          jobId,
          status: "processing",
          totalFiles: files.length,
          completedFiles,
          failedFiles: errors.length,
          errors,
          ...(currentFile ? { currentFile } : {}),
        });

      publishProgress(0);

      // Sequential on purpose: mupdf rasterization is synchronous and CPU-bound,
      // so interleaving documents mostly multiplies peak memory.
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          publishProgress(i, file.filename);
          if (file.buffer.length === 0) {
            throw new PdfInputError("File is empty");
          }
          if (!isPdfBuffer(file.buffer)) {
            throw new PdfInputError("Invalid or corrupt PDF file");
          }
          const childJobId = `${jobId}-f${i}`;
          const prefix = `outputs/${childJobId}`;
          const { filenames } = await renderPdfPages(file.buffer, settings, childJobId);
          const zipName = `${file.filename.replace(/\.pdf$/i, "")}-pages.zip`;
          const key = `${prefix}/${zipName}`;
          await putObject(key, await buildPagesZip(childJobId, filenames));
          results[i] = { key, prefix, filename: zipName };
        } catch (err) {
          // A storage or infrastructure fault is not a bad document. Let it
          // reach the error handler (which logs it, reports it, and honors its
          // status) instead of telling the user their PDF is broken.
          if (typeof (err as { statusCode?: number })?.statusCode === "number") throw err;
          if (err instanceof PdfInputError) {
            errors.push({ filename: file.filename, error: err.message });
          } else {
            request.log.error(
              { err, filename: file.filename, toolId: opts.toolId },
              "PDF batch file conversion failed",
            );
            // Generic on purpose: only messages this route authors are safe to
            // echo, and internal errors can carry absolute paths.
            errors.push({ filename: file.filename, error: "PDF conversion failed" });
          }
        }
      }

      updateJobProgress({
        jobId,
        status: errors.length === files.length ? "failed" : "completed",
        totalFiles: files.length,
        completedFiles: files.length,
        failedFiles: errors.length,
        errors,
      });

      if (errors.length === files.length) {
        // parseApiError on the client reads `error` and `details`, so the
        // per-file reasons have to ride in `details` to be seen at all.
        return reply.status(422).send({
          error: "All files failed processing",
          details: errors.map((e) => `${e.filename}: ${e.error}`),
          errors,
        });
      }

      const uniqueName = createUniqueNamer();
      const fileResultsMap: Record<string, string> = {};
      for (let i = 0; i < results.length; i++) {
        const entry = results[i];
        if (!entry) continue;
        entry.filename = uniqueName(entry.filename);
        fileResultsMap[String(i)] = entry.filename;
      }

      // Hijack and stream the ZIP response
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="batch-${opts.toolId}-${jobId.slice(0, 8)}.zip"`,
        "Transfer-Encoding": "chunked",
        "X-Job-Id": jobId,
        "X-File-Results": encodeURIComponent(JSON.stringify(fileResultsMap)),
        ...getSecurityHeaders(),
      });

      const archive = archiver("zip", { zlib: { level: 5 } });

      // Headers are already out, so a failure here cannot change the status.
      // Destroy the socket rather than end() it: a clean end on a chunked
      // response is indistinguishable from success, and the client would keep
      // a truncated ZIP believing it complete.
      let streamFailed = false;
      const failStream = (err: Error, msg: string) => {
        if (streamFailed) return;
        streamFailed = true;
        request.log.error({ err, jobId }, msg);
        archive.abort();
        reply.raw.destroy(err);
      };

      archive.on("error", (err) => failStream(err, "Archiver error during PDF batch processing"));
      archive.pipe(reply.raw);

      try {
        for (const entry of results) {
          if (!entry) continue;
          const stream = await getObjectStream(entry.key);
          // The local backend resolves the stream and only then emits ENOENT,
          // so the catch below never sees it. Without this listener the error
          // is unhandled and the request hangs instead of terminating.
          stream.on("error", (err: Error) =>
            failStream(err, "Object stream error during PDF batch processing"),
          );
          archive.append(stream, { name: entry.filename });
        }
        await archive.finalize();
      } catch (err) {
        failStream(
          err instanceof Error ? err : new Error(String(err)),
          "Failed to stream ZIP entries during PDF batch processing",
        );
      }

      // The per-page images and per-document ZIPs exist only to build the
      // response, which is now sent. Leaving them would strand every rendered
      // page on the volume until the storage sweep, and they carry no jobs row
      // for retention or GDPR deletion to find.
      await Promise.all(
        results.map((entry) => (entry ? deletePrefix(entry.prefix).catch(() => {}) : null)),
      );
    },
  );

  // ── Main processing endpoint ─────────────────────────────────
  app.post(basePath, async (request, reply) => {
    if (!(await requireToolAccess(request, reply, opts.toolId))) return;

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

    if (!isPdfBuffer(fileBuffer)) {
      return reply.status(400).send({ error: "Invalid or corrupt PDF file" });
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

    if (opts.lockedFormat) {
      settings.format = opts.lockedFormat as typeof settings.format;
    }

    const jobId = randomUUID();
    try {
      const { pages, filenames, totalPages, selectedPages } = await renderPdfPages(
        fileBuffer,
        settings,
        jobId,
      );

      const zipFilename = "pdf-pages.zip";
      const zipBuffer = await buildPagesZip(jobId, filenames);
      await putObject(`outputs/${jobId}/${zipFilename}`, zipBuffer);
      const zipUrl = `/api/v1/download/${jobId}/${encodeURIComponent(zipFilename)}`;

      return reply.send({
        jobId,
        downloadUrl: zipUrl,
        originalSize: fileBuffer.length,
        processedSize: zipBuffer.length,
        pageCount: totalPages,
        selectedPages,
        format: settings.format,
        pages,
        zipUrl,
        zipSize: zipBuffer.length,
      });
    } catch (err) {
      if (err instanceof PdfInputError) {
        return reply.status(400).send({ error: err.message });
      }
      return reply.status(422).send({
        error: "PDF conversion failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}

export function registerPdfToImage(app: FastifyInstance) {
  registerPdfToImageRoute(app, { toolId: "pdf-to-image" });
}

/**
 * Register a "PDF to <format>" conversion preset that reuses the pdf-to-image
 * route logic (ZIP output, info/preview endpoints) with the format locked.
 */
export function registerPdfToImagePreset(
  app: FastifyInstance,
  toolId: string,
  lockedFormat: string,
) {
  registerPdfToImageRoute(app, { toolId, lockedFormat });
}
