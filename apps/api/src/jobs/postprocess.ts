/**
 * Post-processing helpers shared by the inline tool factory and the BullMQ
 * worker runtime. Extracted from tool-factory.ts so both code paths use
 * the same logic without duplication.
 *
 * generatePreview writes to object storage (for the worker). The factory
 * keeps its own workspace-based preview write until Task 8 converts it.
 */
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { probeMedia } from "@snapotter/media-engine";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "../db/index.js";
import { putObject } from "../lib/object-storage.js";
import { pdfFirstPagePreview, videoPosterPreview } from "../modality/preview.js";

// ── Content-type to extension map ──────────────────────────────

export const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/tiff": ".tiff",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jxl": ".jxl",
  "image/x-icon": ".ico",
  "image/vnd.adobe.photoshop": ".psd",
  "image/x-exr": ".exr",
  "image/vnd.radiance": ".hdr",
  "image/x-targa": ".tga",
  "image/jp2": ".jp2",
  "image/qoi": ".qoi",
  "application/postscript": ".eps",
  "image/vnd.ms-dds": ".dds",
  "image/x-dpx": ".dpx",
  "image/fits": ".fits",
  // Video
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  // Audio
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/flac": ".flac",
  "audio/ogg": ".ogg",
  "audio/aac": ".aac",
  // Document / data
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/json": ".json",
  "application/xml": ".xml",
  "application/zip": ".zip",
};

// ── Build output filename ──────────────────────────────────────

/**
 * Build the output filename: add a tool-specific `_toolId` suffix when
 * the tool did not rename the file, then fix the extension when the
 * output content-type differs from the original extension.
 */
export function buildOutputName(
  resultFilename: string,
  originalFilename: string,
  toolId: string,
  contentType: string,
): string {
  let out = resultFilename;

  // Add tool suffix only when the tool did not change the filename
  if (out === originalFilename) {
    const ext = extname(originalFilename);
    const base = ext ? originalFilename.slice(0, -ext.length) : originalFilename;
    out = `${base}_${toolId}${ext}`;
  }

  // Fix extension mismatch (e.g. SVG input -> PNG output)
  const expectedExt = CONTENT_TYPE_TO_EXT[contentType];
  if (expectedExt) {
    const currentExt = extname(out).toLowerCase();
    if (currentExt && currentExt !== expectedExt) {
      out = out.slice(0, -currentExt.length) + expectedExt;
    }
  }

  return out;
}

// ── Generate preview (object-storage backed) ───────────────────

const BROWSER_PREVIEWABLE = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/avif",
]);

/**
 * Generate a browser-previewable thumbnail for formats that browsers
 * cannot render in <img> tags. Writes to object storage under
 * `outputs/<jobId>/preview.<ext>` (webp for images/video, png for PDF).
 *
 * Returns the object key on success, undefined when the format is already
 * previewable or when generation fails (non-fatal).
 */
export async function generatePreview(
  buffer: Buffer,
  contentType: string,
  jobId: string,
  fallbackInput?: Buffer,
): Promise<string | undefined> {
  // Per-modality dispatch (before the image logic)
  if (contentType.startsWith("video/")) {
    const poster = await videoPosterPreview(buffer);
    if (!poster) return undefined;
    const key = `outputs/${jobId}/preview.webp`;
    await putObject(key, poster);
    return key;
  }
  if (contentType.startsWith("audio/")) return undefined; // no preview (spec 4.5)
  if (contentType === "application/pdf") {
    const page = await pdfFirstPagePreview(buffer);
    if (!page) return undefined;
    const key = `outputs/${jobId}/preview.png`;
    await putObject(key, page);
    return key;
  }

  // Image logic unchanged below
  if (BROWSER_PREVIEWABLE.has(contentType)) return undefined;

  const key = `outputs/${jobId}/preview.webp`;

  try {
    let previewInput = buffer;
    // Sharp cannot decode HEIC natively; use system decoder first
    if (contentType === "image/heic" || contentType === "image/heif") {
      const { decodeHeic } = await import("../lib/heic-converter.js");
      previewInput = await decodeHeic(buffer);
    }
    const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
    await putObject(key, previewBuffer);
    return key;
  } catch {
    // Retry with the original input buffer (pre-processing) which was
    // already validated and decoded during the intake phase.
    if (fallbackInput) {
      try {
        const fallbackBuffer = await sharp(fallbackInput).webp({ quality: 80 }).toBuffer();
        await putObject(key, fallbackBuffer);
        return key;
      } catch {
        // Both attempts failed; frontend will use the upload preview
      }
    }
  }
  return undefined;
}

// ── Auto-save to user file library ─────────────────────────────

export interface AutoSaveOpts {
  fileId?: string;
  userId: string | null;
  buffer: Buffer;
  outName: string;
  contentType: string;
  toolId: string;
}

/**
 * Auto-save a processed output to the persistent user file library when a
 * fileId is provided. Creates a new version linked to the parent file with
 * the tool appended to the toolChain.
 *
 * Returns the new file ID on success, undefined when no fileId or on error.
 */
export async function autoSaveToLibrary(opts: AutoSaveOpts): Promise<string | undefined> {
  if (!opts.fileId) return undefined;

  try {
    const { saveFile } = await import("../lib/file-storage.js");
    const [parent] = await db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, opts.fileId));
    if (!parent) return undefined;
    // Only version a file the requester owns; never create a version on
    // another user's file via a known fileId.
    if (parent.userId !== opts.userId) return undefined;

    const newVersion = parent.version + 1;
    const parentChain: string[] = parent.toolChain ?? [];
    const newToolChain = [...parentChain, opts.toolId];
    const storedName = await saveFile(opts.buffer, opts.outName);

    // Output dimensions: sharp for images, ffprobe for video; null where N/A
    // (audio/document have no pixel dimensions). Non-critical, best-effort.
    let width: number | null = null;
    let height: number | null = null;
    if (opts.contentType.startsWith("image/")) {
      try {
        const meta = await sharp(opts.buffer).metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;
      } catch {
        // dimensions are non-critical
      }
    } else if (opts.contentType.startsWith("video/")) {
      const probeDir = join(tmpdir(), `autosave-probe-${randomUUID()}`);
      try {
        await mkdir(probeDir, { recursive: true });
        const probePath = join(probeDir, "input");
        await writeFile(probePath, opts.buffer);
        const info = await probeMedia(probePath);
        const v = info.streams.find((s) => s.type === "video");
        width = v?.width ?? null;
        height = v?.height ?? null;
      } catch {
        // dimensions are non-critical
      } finally {
        await rm(probeDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    const newId = randomUUID();
    await db.insert(schema.userFiles).values({
      id: newId,
      userId: parent.userId,
      originalName: opts.outName,
      storedName,
      mimeType: opts.contentType,
      size: opts.buffer.length,
      width,
      height,
      version: newVersion,
      parentId: opts.fileId,
      toolChain: newToolChain,
    });
    return newId;
  } catch {
    // Non-fatal: tool processing already succeeded
    return undefined;
  }
}
