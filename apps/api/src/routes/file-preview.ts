/**
 * GET /api/v1/files/:id/preview
 *
 * Server-side preview generation for non-native video/audio formats
 * and document files. Generates browser-playable H.264 MP4 (video),
 * MP3 (audio), or PDF (documents) previews and caches them on disk.
 */
import { randomUUID } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { convertDocument, sofficeAvailable } from "@snapotter/doc-engine";
import { runFfmpeg, softwareEncoder } from "@snapotter/media-engine";
import { isSafeMessageError } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config.js";
import { db, schema } from "../db/index.js";
import { reportError } from "../lib/error-report.js";
import { friendlyError } from "../lib/errors.js";
import { getStoredFilePath } from "../lib/file-storage.js";
import { logger } from "../lib/logger.js";
import { hasEffectivePermission, requirePermission } from "../permissions.js";
import { requireAuth } from "../plugins/auth.js";

const PREVIEW_DIR = ".previews";
let previewDirReady: Promise<void> | undefined;

function previewDirPath(): string {
  return join(env.FILES_STORAGE_PATH, PREVIEW_DIR);
}

/**
 * How old a temp dir or `.part` file must be before the startup sweep treats it
 * as orphaned. Replicas can share one DATA_DIR, so a fresh entry may belong to
 * another live process; only something older than the longest preview run can
 * be assumed dead. A limit of 0 means unlimited, so fall back to a day.
 */
function staleAfterMs(): number {
  const encodeS = env.PREVIEW_TIMEOUT_S || 86_400;
  const convertS = env.LIBREOFFICE_TIMEOUT_S || 120;
  return Math.max(encodeS, convertS) * 1000;
}

async function sweepOrphanedPreviewWork(dir: string): Promise<void> {
  const cutoff = Date.now() - staleAfterMs();
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    logger.warn({ err, dir }, "Could not list preview directory for cleanup");
    return;
  }
  for (const entry of entries) {
    const isTempDir = entry.isDirectory();
    const isPartial = entry.isFile() && entry.name.includes(".part.");
    if (!isTempDir && !isPartial) continue;
    const path = join(dir, entry.name);
    try {
      if ((await stat(path)).mtimeMs > cutoff) continue;
      await rm(path, { recursive: isTempDir, force: true });
    } catch (err) {
      logger.warn({ err, path }, "Could not remove orphaned preview work");
    }
  }
}

/**
 * Create the preview dir and sweep leftovers from killed runs once per process
 * (#1320). Concurrent first requests share one promise, so none of them can
 * sweep while another has already started writing.
 */
export function ensurePreviewDir(): Promise<void> {
  previewDirReady ??= (async () => {
    const dir = previewDirPath();
    await mkdir(dir, { recursive: true });
    await sweepOrphanedPreviewWork(dir);
  })().catch((err) => {
    previewDirReady = undefined;
    throw err;
  });
  return previewDirReady;
}

/**
 * Remove cached preview files for a deleted user file (.mp4, .mp3, .pdf).
 */
export async function deletePreview(fileId: string): Promise<void> {
  for (const ext of [".mp4", ".mp3", ".pdf"]) {
    const path = previewPath(fileId, ext);
    await rm(path, { force: true }).catch((err) => {
      logger.warn({ err, fileId, path }, "Could not remove cached preview");
    });
  }
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

/**
 * Only the missing-encoder error is written for the client (#1270); it names
 * what the admin has to install. Other SafeErrors can carry raw tool stderr
 * (the AI bridge builds them from it), and ffmpeg's own failures always do,
 * so everything else stays behind the generic message. `code` and `encoder`
 * let the web UI show that reason translated rather than in English (#1290).
 */
function previewErrorBody(err: unknown): { error: string; code?: string; encoder?: string } {
  // Detected by marker and code, not instanceof, the way SafeErrors are
  // everywhere (packages/shared/src/tool-errors.ts): it survives a copied error.
  const encoder = (err as { encoder?: unknown }).encoder;
  if (isSafeMessageError(err) && err.code === "ENCODER_MISSING" && typeof encoder === "string") {
    return { error: friendlyError(err.message), code: err.code, encoder };
  }
  return { error: "Could not generate preview" };
}

/**
 * Time limit for one preview encode, so a hung ffmpeg can't hold a request for
 * the two-hour media job limit to render a clip capped at a minute (#1406).
 * PREVIEW_TIMEOUT_S, 0 = unlimited.
 */
function previewTimeoutMs(): number {
  return env.PREVIEW_TIMEOUT_S * 1000;
}

/**
 * A signal that fires when the client hangs up before the response ends
 * (#1406). Only the on-demand preview uses it: its output is thrown away, while
 * a stored-file preview lands in the cache, so finishing that one after a
 * proxy gives up turns the retry into a cache hit. Call release() once the
 * encode settles.
 */
function abortOnDisconnect(request: FastifyRequest, reply: FastifyReply) {
  const abort = new AbortController();
  const onClose = () => {
    if (!reply.raw.writableEnded) abort.abort();
  };
  // A hangup while the upload was still being read has already fired "close".
  if (reply.raw.destroyed || request.raw.socket?.destroyed) abort.abort();
  else reply.raw.once("close", onClose);
  return {
    signal: abort.signal,
    clientGone: () => abort.signal.aborted,
    release: () => reply.raw.off("close", onClose),
  };
}

/** Best-effort removal of an unfinished preview; logged, since nothing else clears it. */
async function removePartialPreview(
  path: string,
  log: { warn: (obj: object, msg: string) => void },
): Promise<void> {
  await rm(path, { force: true }).catch((err) => {
    log.warn({ err, path }, "Could not remove partial preview");
  });
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

        // Convert inside a per-request temp directory inside the preview dir.
        // Multiple concurrent requests for the same uncached document each get
        // their own input copy and output directory, so neither overwrites the
        // other's input or picks up a partial output (#1319). Keeping the temp
        // directory on the preview filesystem keeps the final rename atomic.
        const origExt = file.originalName.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
        let tempDir: string | undefined;

        try {
          // Staging touches only the server's own disk and stored file: a full
          // disk, an unwritable preview dir, or a stored file gone from disk is
          // a 500 worth reporting, not a document LibreOffice can't read (#1404).
          let stagedDir: string;
          let tempInput: string;
          try {
            stagedDir = await mkdtemp(join(previewDirPath(), `${id}-`));
            tempDir = stagedDir;
            tempInput = join(stagedDir, `input${origExt}`);
            await copyFile(inputPath, tempInput);
          } catch (stageErr) {
            request.log.error({ err: stageErr, fileId: id }, "Document preview staging failed");
            void reportError(stageErr, {
              source: "http",
              route: "/api/v1/files/:id/preview",
              method: "GET",
              statusCode: 500,
            });
            return reply.status(500).send({ error: "Could not prepare document preview" });
          }

          await convertDocument(tempInput, stagedDir, "pdf", {
            timeoutMs: (env.LIBREOFFICE_TIMEOUT_S || 120) * 1000,
          });

          // convertDocument outputs next to the temp file: input.pdf
          const producedPath = join(stagedDir, "input.pdf");
          try {
            await rename(producedPath, cachedPath);
          } catch (renameErr) {
            request.log.error(
              { err: renameErr, fileId: id, cachedPath },
              "Document preview cache write failed",
            );
            void reportError(renameErr, {
              source: "http",
              route: "/api/v1/files/:id/preview",
              method: "GET",
              statusCode: 500,
            });
            return reply.status(500).send({ error: "Could not store preview" });
          }
        } catch (err) {
          request.log.error({ err, fileId: id }, "Document preview generation failed");
          return reply.status(422).send({ error: "Could not generate document preview" });
        } finally {
          if (tempDir) {
            await rm(tempDir, { recursive: true, force: true }).catch(() => {});
          }
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

      // Generate preview via FFmpeg. It encodes into a temp file that is only
      // renamed into the cache once it finishes: written straight to
      // cachedPath, a run that died partway left a truncated file there, and
      // every later request served it as `immutable` (#1291). The temp name
      // ends in the real extension because ffmpeg picks the container from it.
      await ensurePreviewDir();
      const inputPath = getStoredFilePath(file.storedName);
      const partialPath = resolveWithinPreviewDir(`${id}.${randomUUID()}.part${previewExt}`);

      try {
        if (isVideo) {
          await runFfmpeg(
            [
              "-i",
              inputPath,
              "-t",
              "30",
              "-vf",
              "scale='min(720,iw)':-2",
              "-c:v",
              softwareEncoder("h264"),
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
              partialPath,
            ],
            { timeoutMs: previewTimeoutMs() },
          );
        } else {
          await runFfmpeg(
            [
              "-i",
              inputPath,
              "-t",
              "60",
              "-c:a",
              softwareEncoder("mp3"),
              "-b:a",
              "128k",
              "-y",
              partialPath,
            ],
            { timeoutMs: previewTimeoutMs() },
          );
        }
      } catch (err) {
        await removePartialPreview(partialPath, request.log);
        request.log.error({ err, fileId: id }, "Preview generation failed");
        return reply.status(422).send(previewErrorBody(err));
      }

      // Same directory, so the rename is atomic: a concurrent request sees
      // either no cache file or a complete one. A failure here is the server's
      // (a read-only or full preview dir), not the file's, so it is a 500.
      try {
        await rename(partialPath, cachedPath);
      } catch (err) {
        await removePartialPreview(partialPath, request.log);
        request.log.error({ err, fileId: id, cachedPath }, "Preview cache write failed");
        void reportError(err, {
          source: "http",
          route: "/api/v1/files/:id/preview",
          method: "GET",
          statusCode: 500,
        });
        return reply.status(500).send({ error: "Could not store preview" });
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
      // Spawns FFmpeg over caller-supplied bytes for the tool workflow, so it takes
      // the same grant as running a tool. This used to call getAuthUser and discard
      // the result, leaving it open to any authenticated principal no matter what
      // the operator had scoped them down to.
      if (!(await requirePermission("tools:use")(request, reply))) return;

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
      const disconnect = abortOnDisconnect(request, reply);
      const encodeOptions = { timeoutMs: previewTimeoutMs(), signal: disconnect.signal };

      try {
        await writeFile(inputPath, fileBuffer);

        if (isVideo) {
          await runFfmpeg(
            [
              "-i",
              inputPath,
              "-t",
              "30",
              "-vf",
              "scale='min(720,iw)':-2",
              "-c:v",
              softwareEncoder("h264"),
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
            ],
            encodeOptions,
          );
        } else {
          await runFfmpeg(
            [
              "-i",
              inputPath,
              "-t",
              "60",
              "-c:a",
              softwareEncoder("mp3"),
              "-b:a",
              "128k",
              "-y",
              outputPath,
            ],
            encodeOptions,
          );
        }

        const outputBuffer = await readFile(outputPath);
        const contentType = isVideo ? "video/mp4" : "audio/mpeg";

        return reply
          .header("Content-Type", contentType)
          .header("Content-Length", outputBuffer.length)
          .send(outputBuffer);
      } catch (err) {
        if (disconnect.clientGone()) {
          request.log.info({ filename }, "On-demand preview stopped: client disconnected");
        } else {
          request.log.error({ err, filename }, "On-demand preview generation failed");
        }
        return reply.status(422).send(previewErrorBody(err));
      } finally {
        disconnect.release();
        await rm(inputPath, { force: true }).catch(() => {});
        await rm(outputPath, { force: true }).catch(() => {});
      }
    },
  );

  app.log.info("File preview routes registered");
}
