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
import { type LibrarySaveMode, SafeError } from "@snapotter/shared";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, schema } from "../db/index.js";
import { reportEngineUnavailable } from "../lib/engine-unavailable.js";
import { reportError } from "../lib/error-report.js";
import {
  asDecoderOutOfMemory,
  decodeToSharpCompat,
  isDecoderUnavailable,
} from "../lib/format-decoders.js";
import { logger } from "../lib/logger.js";
import { putObject } from "../lib/object-storage.js";
import { engineUnavailable } from "../modality/image-input.js";
import { pdfFirstPagePreview, videoPosterPreview } from "../modality/preview.js";
import { claimFinalize, releaseFinalize } from "./cancel.js";

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

const CLI_DECODE_FORMAT_BY_MIME: Readonly<Record<string, string>> = {
  "image/x-icon": "ico",
  "image/vnd.adobe.photoshop": "psd",
  "image/x-tga": "tga",
  "image/x-targa": "tga",
  "image/jxl": "jxl",
  "image/jp2": "jp2",
  "image/jpx": "jp2",
  "image/qoi": "qoi",
  "image/x-qoi": "qoi",
  "image/x-portable-pixmap": "ppm",
  "image/x-portable-graymap": "pgm",
  "image/x-portable-bitmap": "pbm",
  "image/x-portable-anymap": "ppm",
  "image/vnd.ms-dds": "dds",
  "image/x-dds": "dds",
  "image/x-exr": "exr",
  "image/vnd.radiance": "hdr",
  "image/x-dpx": "dpx",
  "image/x-cineon": "dpx",
  "image/fits": "fits",
  "image/x-eps": "eps",
  "application/postscript": "eps",
};

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
  toolId = "output-preview",
): Promise<string | undefined> {
  if (contentType.startsWith("audio/")) return undefined; // no preview (spec 4.5)

  try {
    // Per-modality dispatch (before the image logic)
    if (contentType.startsWith("video/")) {
      const poster = await videoPosterPreview(buffer);
      if (!poster) return undefined;
      const key = `outputs/${jobId}/preview.webp`;
      await putObject(key, poster);
      return key;
    }
    if (contentType === "application/pdf") {
      const page = await pdfFirstPagePreview(buffer);
      if (!page) return undefined;
      const key = `outputs/${jobId}/preview.png`;
      await putObject(key, page);
      return key;
    }

    // Image logic unchanged below (application/postscript is EPS's registered MIME)
    if (!contentType.startsWith("image/") && contentType !== "application/postscript") {
      return undefined;
    }
    if (BROWSER_PREVIEWABLE.has(contentType)) return undefined;

    const key = `outputs/${jobId}/preview.webp`;

    let previewInput = buffer;
    const cliFormat = CLI_DECODE_FORMAT_BY_MIME[contentType];
    // Sharp cannot decode HEIC or CLI-encoded formats natively; use system decoder first
    if (contentType === "image/heic" || contentType === "image/heif") {
      const { decodeHeic } = await import("../lib/heic-converter.js");
      previewInput = await decodeHeic(buffer);
    } else if (cliFormat) {
      previewInput = await decodeToSharpCompat(buffer, cliFormat);
    }
    const previewBuffer = await sharp(previewInput).webp({ quality: 80 }).toBuffer();
    await putObject(key, previewBuffer);
    return key;
  } catch (err) {
    const decoderErr = asDecoderOutOfMemory(err);
    if (isDecoderUnavailable(decoderErr)) {
      reportEngineUnavailable(engineUnavailable(decoderErr), toolId, logger);
      return undefined;
    }
    // The result itself can't be decoded for a preview. Do NOT fall back to the
    // pre-processing input: the client renders this preview under the processed
    // filename, so an input-derived preview would show the untouched original as
    // if it were the result (#746). No honest preview exists, so the frontend
    // shows a success card instead.
    logger.warn(
      { err, jobId, contentType },
      "preview generation failed; result has no renderable preview",
    );
  }
  return undefined;
}

// ── Auto-save to user file library ─────────────────────────────

export interface AutoSaveOpts {
  fileId?: string;
  /** "overwrite" supersedes the original with a linked version; "new" (default) keeps it. */
  saveMode?: LibrarySaveMode;
  userId: string | null;
  buffer: Buffer;
  outName: string;
  contentType: string;
  toolId: string;
  /** The job the output belongs to, for the logs and the error report. */
  jobId: string;
  /**
   * The worker's userCancelSignal, never the job's own signal: a deadline that
   * fired under a handler that returned anyway must not stop the save (#2144).
   * A cancel that lands before the version row stops the save and takes the
   * blob back; one that lands after it is too late, and the job completes with
   * the version (#2143).
   */
  userCancel?: AbortSignal;
}

/**
 * The save stopping itself for a user cancel. Told apart by type, so a storage
 * or database fault is never mistaken for it, whatever its message says.
 */
class AutoSaveCanceledError extends Error {
  constructor() {
    super("Canceled");
    this.name = "AutoSaveCanceledError";
  }
}

/**
 * Deletes a staged library blob when the version row will not be committed
 * (user cancel, quota refusal, or database error). No `user_files` row points
 * at `storedName`, so a failed delete leaves a permanent orphan: log it with
 * the job and blob context and report `STAGED_DISCARD_FAILED` (#2583).
 */
async function discardStagedBlob(
  opts: AutoSaveOpts,
  storedName: string,
  logMessage: string,
): Promise<void> {
  try {
    const { deleteStoredFile } = await import("../lib/file-storage.js");
    await deleteStoredFile(storedName);
  } catch (cleanupErr) {
    logger.error(
      {
        err: cleanupErr,
        jobId: opts.jobId,
        storedName,
        fileId: opts.fileId,
        toolId: opts.toolId,
      },
      logMessage,
    );
    void reportError(
      new SafeError("Could not discard a staged upload", {
        kind: "operational",
        code: "STAGED_DISCARD_FAILED",
        cause: cleanupErr,
      }),
      {
        source: "worker",
        toolId: opts.toolId,
        jobId: opts.jobId,
        subsystem: "upload-storage",
      },
    );
  }
}

async function releaseStagedFinalize(opts: AutoSaveOpts): Promise<void> {
  await releaseFinalize(opts.jobId).catch((releaseErr) => {
    logger.warn(
      { err: releaseErr, jobId: opts.jobId, toolId: opts.toolId },
      "failed to release finalize claim after auto-save error",
    );
  });
}

export type AutoSaveTx = Pick<typeof db, "select" | "insert" | "update"> & {
  execute?: typeof db.execute;
};

export interface StagedAutoSave {
  fileId?: string;
  error?: string;
  finalizeClaimed?: boolean;
  commit?: (tx: AutoSaveTx) => Promise<{ fileId?: string; error?: string }>;
  afterCommit?: (releaseClaim?: boolean) => Promise<{ fileId?: string; error?: string }>;
  onAbort?: (unhandledTxErr?: unknown) => Promise<void>;
}

/**
 * Stage a library auto-save outside the job's completion transaction (parent
 * lookup, blob upload, dimension probe, and finalize claim), returning hooks
 * that insert the `user_files` row and charge `users.storage_used` inside the
 * caller's transaction (#2350):
 *   - `commit(tx)` runs the quota lock-and-check, row insert, and storage charge.
 *   - `afterCommit()` discards the staged blob and reports any save-only fault
 *     when the save was skipped inside a transaction that still committed.
 *   - `onAbort()` discards the staged blob and reports any save fault when the
 *     enclosing transaction rolled back.
 */
export async function stageAutoSaveToLibrary(opts: AutoSaveOpts): Promise<StagedAutoSave> {
  if (!opts.fileId) return {};

  let storedName: string | undefined;
  let finalizeClaimed = false;
  try {
    const { saveFile } = await import("../lib/file-storage.js");
    const { quotaRefusal } = await import("../lib/quota.js");

    const [parent] = await db
      .select()
      .from(schema.userFiles)
      .where(eq(schema.userFiles.id, opts.fileId));
    // Nothing is written yet, so a cancel that landed by now just stops here.
    if (opts.userCancel?.aborted) throw new AutoSaveCanceledError();
    if (!parent) return {};

    const parentUserId = parent.userId;
    // Only version a file the requester owns; never create a version on
    // another user's file via a known fileId.
    if (!parentUserId || parentUserId !== opts.userId) return {};

    const fileId = opts.fileId;
    const overwrite = opts.saveMode === "overwrite";
    const parentChain: string[] = parent.toolChain ?? [];
    const newToolChain = [...parentChain, opts.toolId];
    storedName = await saveFile(opts.buffer, opts.outName);

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

    // The last point a cancel can stop the save (#2143, #2349). Past it the
    // version row goes in with the completion commit, and a cancel is too late.
    if (opts.userCancel && (opts.userCancel.aborted || !(await claimFinalize(opts.jobId)))) {
      await discardStagedBlob(
        opts,
        storedName,
        "canceled library auto-save could not remove its blob; it is an orphan",
      );
      throw new AutoSaveCanceledError();
    }
    finalizeClaimed = Boolean(opts.userCancel);

    const stagedBlobName = storedName;
    const newId = randomUUID();
    let commitOutcome:
      | { kind: "none" }
      | { kind: "saved"; fileId: string }
      | { kind: "skipped" }
      | { kind: "quota"; error: string }
      | { kind: "error"; err: unknown; error: string } = { kind: "none" };
    let blobCleaned = false;

    const discardOnce = async (logMessage: string): Promise<void> => {
      if (blobCleaned) return;
      blobCleaned = true;
      await discardStagedBlob(opts, stagedBlobName, logMessage);
    };

    const runSaveQueries = async (tx: AutoSaveTx): Promise<{ fileId?: string; error?: string }> => {
      const runSql = typeof tx.execute === "function" ? tx.execute.bind(tx) : undefined;
      if (runSql) {
        await runSql(sql`SAVEPOINT autosave_library`);
      }
      try {
        const overQuota = await quotaRefusal(tx, parentUserId, opts.buffer.length, true);
        if (overQuota) {
          if (runSql) {
            await runSql(sql`RELEASE SAVEPOINT autosave_library`);
          }
          return { error: overQuota };
        }

        if (overwrite) {
          const [currentParent] = await tx
            .select({ id: schema.userFiles.id })
            .from(schema.userFiles)
            .where(eq(schema.userFiles.id, fileId))
            .limit(1)
            .for("no key update");
          if (!currentParent) {
            if (runSql) {
              await runSql(sql`RELEASE SAVEPOINT autosave_library`);
            }
            return {};
          }
        }

        await tx.insert(schema.userFiles).values({
          id: newId,
          userId: parentUserId,
          originalName: opts.outName,
          storedName: stagedBlobName,
          mimeType: opts.contentType,
          size: opts.buffer.length,
          width,
          height,
          version: overwrite ? parent.version + 1 : 1,
          parentId: overwrite ? fileId : null,
          toolChain: newToolChain,
        });

        await tx
          .update(schema.users)
          .set({ storageUsed: sql`${schema.users.storageUsed} + ${opts.buffer.length}` })
          .where(eq(schema.users.id, parentUserId));

        if (runSql) {
          await runSql(sql`RELEASE SAVEPOINT autosave_library`);
        }
        return { fileId: newId };
      } catch (err) {
        let savepointRecovered = !runSql;
        if (runSql) {
          try {
            await runSql(sql`ROLLBACK TO SAVEPOINT autosave_library`);
            await runSql(sql`RELEASE SAVEPOINT autosave_library`).catch(() => {});
            savepointRecovered = true;
          } catch {
            savepointRecovered = false;
          }
        }
        if (!savepointRecovered) {
          throw Object.assign(err instanceof Error ? err : new Error(String(err)), {
            _txAborted: true,
          });
        }
        throw err;
      }
    };

    return {
      finalizeClaimed,
      commit: async (tx: AutoSaveTx) => {
        try {
          const res = await runSaveQueries(tx);
          if (res.error) {
            commitOutcome = { kind: "quota", error: res.error };
            if (opts.userCancel?.aborted) {
              throw new AutoSaveCanceledError();
            }
            return res;
          }
          if (!res.fileId) {
            commitOutcome = { kind: "skipped" };
            if (opts.userCancel?.aborted) {
              throw new AutoSaveCanceledError();
            }
            return res;
          }
          commitOutcome = { kind: "saved", fileId: newId };
          return res;
        } catch (err) {
          if (err instanceof AutoSaveCanceledError) throw err;
          // If ROLLBACK TO SAVEPOINT failed, the enclosing transaction cannot
          // execute any more statements; rethrow the original fault when the
          // user did not cancel so the outer transaction fails with its real
          // cause instead of a secondary 25P02 on the next query.
          if ((err as { _txAborted?: boolean })?._txAborted && !opts.userCancel?.aborted) {
            throw err;
          }
          commitOutcome = {
            kind: "error",
            err,
            error: "An unexpected system error prevented saving to your library.",
          };
          if (opts.userCancel?.aborted) {
            throw err;
          }
          return { error: commitOutcome.error };
        }
      },
      afterCommit: async (releaseClaim = false) => {
        if (commitOutcome.kind === "saved") {
          return { fileId: commitOutcome.fileId };
        }
        if (commitOutcome.kind === "skipped") {
          if (releaseClaim && finalizeClaimed) {
            await releaseStagedFinalize(opts);
            finalizeClaimed = false;
          }
          await discardOnce("Failed to delete orphaned file after parent file was deleted");
          return {};
        }
        if (commitOutcome.kind === "quota") {
          if (releaseClaim && finalizeClaimed) {
            await releaseStagedFinalize(opts);
            finalizeClaimed = false;
          }
          await discardOnce("Failed to delete orphaned file during quota rejection");
          return { error: commitOutcome.error };
        }
        if (commitOutcome.kind === "error") {
          if (releaseClaim && finalizeClaimed) {
            await releaseStagedFinalize(opts);
            finalizeClaimed = false;
          }
          await discardOnce("Failed to delete orphaned file after auto-save error");
          logger.warn(
            {
              err: commitOutcome.err,
              jobId: opts.jobId,
              storedName: stagedBlobName,
              fileId: opts.fileId,
              toolId: opts.toolId,
            },
            "library auto-save failed; no library copy was made",
          );
          await reportError(commitOutcome.err as Error, {
            source: "worker",
            toolId: opts.toolId,
            jobId: opts.jobId,
          });
          return { error: commitOutcome.error };
        }
        return {};
      },
      onAbort: async (unhandledTxErr?: unknown) => {
        if (commitOutcome.kind === "skipped") {
          await discardOnce(
            opts.userCancel?.aborted
              ? "canceled library auto-save could not remove its blob; it is an orphan"
              : "Failed to delete orphaned file after parent file was deleted",
          );
          return;
        }
        if (commitOutcome.kind === "quota") {
          await discardOnce("Failed to delete orphaned file during quota rejection");
          return;
        }
        if (commitOutcome.kind === "error") {
          await discardOnce("Failed to delete orphaned file after auto-save error");
          logger.warn(
            {
              err: commitOutcome.err,
              jobId: opts.jobId,
              storedName: stagedBlobName,
              fileId: opts.fileId,
              toolId: opts.toolId,
            },
            "library auto-save failed; no library copy was made",
          );
          await reportError(commitOutcome.err as Error, {
            source: "worker",
            toolId: opts.toolId,
            jobId: opts.jobId,
          });
          return;
        }
        await discardOnce(
          opts.userCancel?.aborted
            ? "canceled library auto-save could not remove its blob; it is an orphan"
            : "Failed to delete orphaned file after auto-save error",
        );
        if (unhandledTxErr !== undefined && !(unhandledTxErr instanceof AutoSaveCanceledError)) {
          logger.warn(
            {
              err: unhandledTxErr,
              jobId: opts.jobId,
              storedName: stagedBlobName,
              fileId: opts.fileId,
              toolId: opts.toolId,
            },
            "library auto-save failed; no library copy was made",
          );
          await reportError(unhandledTxErr as Error, {
            source: "worker",
            toolId: opts.toolId,
            jobId: opts.jobId,
          });
        }
      },
    };
  } catch (err) {
    // The save stopped for a cancel and has dealt with its blob (removed, or
    // logged as an orphan). The worker's catch settles the job canceled and
    // removes its outputs (#2143).
    if (err instanceof AutoSaveCanceledError) throw err;
    if (finalizeClaimed) {
      await releaseStagedFinalize(opts);
    }
    if (storedName) {
      await discardStagedBlob(
        opts,
        storedName,
        "Failed to delete orphaned file after auto-save error",
      );
    }
    logger.warn(
      { err, jobId: opts.jobId, storedName, fileId: opts.fileId, toolId: opts.toolId },
      "library auto-save failed; no library copy was made",
    );
    await reportError(err as Error, {
      source: "worker",
      toolId: opts.toolId,
      jobId: opts.jobId,
    });
    // A cancel that landed while the save was failing still settles the job
    // canceled, now that the failure is on record.
    if (opts.userCancel?.aborted) throw err;
    // Non-fatal otherwise: the tool already succeeded, and the result stays
    // downloadable without a library copy.
    return { error: "An unexpected system error prevented saving to your library." };
  }
}

/**
 * Auto-save a processed output to the persistent user file library when a
 * fileId is provided. The tool is appended to the parent's toolChain either
 * way; saveMode decides the linkage (issue #495):
 *   - "new" (default): independent root row (version 1, no parentId), so the
 *     original stays visible in the leaf-only library list.
 *   - "overwrite": new version linked to the parent (version + 1, parentId),
 *     which supersedes the original in the list.
 *
 * Returns `{ fileId }` on success, `{ error }` when over quota or on a save
 * failure, or `{}` when there is no fileId or no such file of the requester's.
 * Rejects when a user cancel landed before the version row (#2143): with
 * "Canceled", or with the save's own error if it failed meanwhile. Either way
 * the worker's catch settles the job canceled instead of completing it.
 */
export async function autoSaveToLibrary(
  opts: AutoSaveOpts,
): Promise<{ fileId?: string; error?: string }> {
  const staged = await stageAutoSaveToLibrary(opts);
  const commit = staged.commit;
  if (!commit) {
    return {
      ...(staged.fileId && { fileId: staged.fileId }),
      ...(staged.error && { error: staged.error }),
    };
  }
  try {
    await db.transaction(async (tx) => {
      await commit(tx as unknown as AutoSaveTx);
    });
  } catch (err) {
    if (staged.finalizeClaimed && !(err instanceof AutoSaveCanceledError)) {
      await releaseStagedFinalize(opts);
    }
    await staged.onAbort?.(err);
    if (err instanceof AutoSaveCanceledError || opts.userCancel?.aborted) {
      throw err;
    }
    return { error: "An unexpected system error prevented saving to your library." };
  }
  return (await staged.afterCommit?.(true)) ?? {};
}
