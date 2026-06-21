/**
 * GET /api/v1/files/:id/preview
 *
 * Server-side preview generation for non-native video/audio formats
 * and document files. Generates browser-playable H.264 MP4 (video),
 * MP3 (audio), or PDF (documents) previews and caches them on disk.
 */
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { convertDocument, sofficeAvailable } from "@snapotter/doc-engine";
import { runFfmpeg } from "@snapotter/media-engine";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { getStoredFilePath } from "../lib/file-storage.js";
import { hasEffectivePermission } from "../permissions.js";
import { getAuthUser, requireAuth } from "../plugins/auth.js";

const PREVIEW_DIR = ".previews";
let previewDirReady = false;

function previewDirPath(): string {
  return join(env.FILES_STORAGE_PATH, PREVIEW_DIR);
}

async function ensurePreviewDir(): Promise<void> {
  if (previewDirReady) return;
  await mkdir(previewDirPath(), { recursive: true });
  previewDirReady = true;
}

/**
 * Resolve a name inside the preview directory and verify the result cannot
 * escape it. The id is already charset-validated at the route; this containment
 * check is the authoritative path-traversal barrier for every preview path.
 */
function resolveWithinPreviewDir(name: string): string {
  // basename() strips any directory component, so the result can only ever be a
  // single filename inside the preview dir; the containment check is a
  // defense-in-depth backstop.
  const base = resolve(previewDirPath());
  const resolved = join(base, basename(name));
  if (resolved !== base && !resolved.startsWith(base + sep)) {
    throw new Error("Preview path escapes the preview directory");
  }
  return resolved;
}

function previewPath(fileId: string, ext: string): string {
  return resolveWithinPreviewDir(`${fileId}${ext}`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const OFFICE_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);

export async function filePreviewRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/files/:id/preview",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = requireAuth(request, reply);
      if (!user) return;

      const { id } = request.params;

      // Confine id to a safe charset (no path separators or dots) before it is
      // interpolated into filesystem paths below -- prevents path traversal via
      // the URL param. File ids are generated server-side (randomUUID).
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        return reply.status(400).send({ error: "Invalid file id" });
      }

      const [file] = await db.select().from(schema.userFiles).where(eq(schema.userFiles.id, id));

      if (
        !file ||
        (file.userId !== user.id && !(await hasEffectivePermission(user, "files:all")))
      ) {
        return reply.status(404).send({ error: "File not found" });
      }

      const isVideo = file.mimeType.startsWith("video/");
      const isAudio = file.mimeType.startsWith("audio/");
      const isPdf = file.mimeType === "application/pdf";
      const isOfficeDoc = OFFICE_MIMES.has(file.mimeType);

      if (!isVideo && !isAudio && !isPdf && !isOfficeDoc) {
        return reply.status(400).send({ error: "Preview not supported for this file type" });
      }

      // PDF: stream the original file directly
      if (isPdf) {
        const inputPath = getStoredFilePath(file.storedName);
        return reply
          .header("Content-Type", "application/pdf")
          .header("Cache-Control", "public, max-age=86400, immutable")
          .send(createReadStream(inputPath));
      }

      // Office documents: convert to PDF via LibreOffice
      if (isOfficeDoc) {
        const cachedPath = previewPath(id, ".pdf");

        if (await fileExists(cachedPath)) {
          return reply
            .header("Content-Type", "application/pdf")
            .header("Cache-Control", "public, max-age=86400, immutable")
            .send(createReadStream(cachedPath));
        }

        if (!sofficeAvailable()) {
          return reply
            .status(422)
            .send({ error: "LibreOffice is not available for document preview" });
        }

        await ensurePreviewDir();
        const inputPath = getStoredFilePath(file.storedName);

        // Copy to a temp file with the original extension so LibreOffice
        // can detect the format correctly from the extension.
        // Restrict to an alphanumeric extension (no path separators) -- the
        // original filename is user-controlled and feeds a filesystem path.
        const origExt = file.originalName.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
        const tempInput = resolveWithinPreviewDir(`${id}-input${origExt}`);
        await copyFile(inputPath, tempInput);

        try {
          await convertDocument(tempInput, previewDirPath(), "pdf", {
            timeoutMs: (env.LIBREOFFICE_TIMEOUT_S || 120) * 1000,
          });

          // convertDocument outputs next to the temp file; rename to cached path
          const producedPath = resolveWithinPreviewDir(`${id}-input.pdf`);
          await rename(producedPath, cachedPath);
        } catch (err) {
          request.log.error({ err, fileId: id }, "Document preview generation failed");
          return reply.status(422).send({ error: "Could not generate document preview" });
        } finally {
          // Clean up temp input copy
          await rm(tempInput, { force: true }).catch(() => {});
        }

        return reply
          .header("Content-Type", "application/pdf")
          .header("Cache-Control", "public, max-age=86400, immutable")
          .send(createReadStream(cachedPath));
      }

      // Video / Audio preview via FFmpeg
      const previewExt = isVideo ? ".mp4" : ".mp3";
      const contentType = isVideo ? "video/mp4" : "audio/mpeg";
      const cachedPath = previewPath(id, previewExt);

      // Serve from cache if available
      if (await fileExists(cachedPath)) {
        return reply
          .header("Content-Type", contentType)
          .header("Cache-Control", "public, max-age=86400, immutable")
          .send(createReadStream(cachedPath));
      }

      // Generate preview via FFmpeg
      await ensurePreviewDir();
      const inputPath = getStoredFilePath(file.storedName);

      try {
        if (isVideo) {
          await runFfmpeg([
            "-i",
            inputPath,
            "-t",
            "30",
            "-vf",
            "scale='min(720,iw)':-2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            "-y",
            cachedPath,
          ]);
        } else {
          await runFfmpeg([
            "-i",
            inputPath,
            "-t",
            "60",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-y",
            cachedPath,
          ]);
        }
      } catch (err) {
        request.log.error({ err, fileId: id }, "Preview generation failed");
        return reply.status(422).send({ error: "Could not generate preview" });
      }

      return reply
        .header("Content-Type", contentType)
        .header("Cache-Control", "public, max-age=86400, immutable")
        .send(createReadStream(cachedPath));
    },
  );

  // ── On-demand preview for uploaded (non-stored) media files ─────
  app.post(
    "/api/v1/preview/generate",
    {
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Optional auth -- the preview is for the user's own uploaded file
      getAuthUser(request);

      const parts = request.parts();
      let fileBuffer: Buffer | null = null;
      let filename = "input";

      for await (const part of parts) {
        if (part.type !== "file") continue;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        fileBuffer = Buffer.concat(chunks);
        filename = part.filename ?? "input";
        break; // only process the first file
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({ error: "No file provided" });
      }

      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const videoExts = new Set([
        "avi",
        "mkv",
        "wmv",
        "flv",
        "mov",
        "mpg",
        "mpeg",
        "m4v",
        "3gp",
        "3g2",
        "ts",
        "mts",
        "m2ts",
        "vob",
        "divx",
        "asf",
        "rm",
        "rmvb",
        "f4v",
        "ogv",
        "mp4",
        "webm",
        "ogg",
      ]);
      const audioExts = new Set([
        "wav",
        "flac",
        "aac",
        "wma",
        "ogg",
        "oga",
        "opus",
        "m4a",
        "aiff",
        "aif",
        "amr",
        "ape",
        "ac3",
        "dts",
        "mp3",
      ]);

      const isVideo = videoExts.has(ext);
      const isAudio = audioExts.has(ext);

      if (!isVideo && !isAudio) {
        return reply.status(400).send({ error: "Unsupported file type for preview" });
      }

      const id = randomUUID();
      const inputPath = join(tmpdir(), `snapotter-preview-${id}.${ext}`);
      const outputExt = isVideo ? "mp4" : "mp3";
      const outputPath = join(tmpdir(), `snapotter-preview-${id}-out.${outputExt}`);

      try {
        await writeFile(inputPath, fileBuffer);

        if (isVideo) {
          await runFfmpeg([
            "-i",
            inputPath,
            "-t",
            "30",
            "-vf",
            "scale='min(720,iw)':-2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            "-y",
            outputPath,
          ]);
        } else {
          await runFfmpeg([
            "-i",
            inputPath,
            "-t",
            "60",
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-y",
            outputPath,
          ]);
        }

        const outputBuffer = await readFile(outputPath);
        const contentType = isVideo ? "video/mp4" : "audio/mpeg";

        return reply
          .header("Content-Type", contentType)
          .header("Content-Length", outputBuffer.length)
          .send(outputBuffer);
      } catch (err) {
        request.log.error({ err, filename }, "On-demand preview generation failed");
        return reply.status(422).send({ error: "Could not generate preview" });
      } finally {
        await rm(inputPath, { force: true }).catch(() => {});
        await rm(outputPath, { force: true }).catch(() => {});
      }
    },
  );

  app.log.info("File preview routes registered");
}
