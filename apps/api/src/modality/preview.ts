import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveGs } from "@snapotter/doc-engine";
import { ffmpegAvailable, runFfmpeg } from "@snapotter/media-engine";
import { hasServerErrorStatus } from "@snapotter/shared";
import { isOperationalErrno } from "../lib/error-report.js";
import { logger } from "../lib/logger.js";

const PREVIEW_WIDTH = 480;

const PREVIEW_OPERATIONAL_CODES = new Set([
  "ENOSPC",
  "EDQUOT",
  "EACCES",
  "EPERM",
  "EROFS",
  "EMFILE",
  "ENFILE",
  "ENOMEM",
  "EIO",
]);

/**
 * True when a preview or thumbnail failure is an operational/server fault
 * (scratch disk/permission/descriptor/memory errno, syscall-bearing spawn or
 * filesystem failure, 5xx status-bearing error, or runtime programming defect)
 * rather than an input file the preview engine could not render (#2870).
 */
export function isPreviewServerFault(err: unknown): boolean {
  if (isOperationalErrno(err) || hasServerErrorStatus(err)) {
    return true;
  }
  const { code, syscall } = (err ?? {}) as NodeJS.ErrnoException;
  if (typeof code === "string" && PREVIEW_OPERATIONAL_CODES.has(code)) {
    return true;
  }
  if (typeof syscall === "string" && !(code === "ENOENT" && syscall === "open")) {
    return true;
  }
  return (
    err instanceof TypeError ||
    err instanceof ReferenceError ||
    err instanceof SyntaxError ||
    (err instanceof RangeError && err.message.startsWith("Array buffer allocation failed"))
  );
}

function isMissingPreviewOutput(err: unknown, outputPath: string): boolean {
  const e = err as NodeJS.ErrnoException | null;
  return e?.code === "ENOENT" && e?.syscall === "open" && e?.path === outputPath;
}

/** Video poster frame as WebP, or null when ffmpeg is unavailable/fails. */
export async function videoPosterPreview(buffer: Buffer): Promise<Buffer | null> {
  if (!ffmpegAvailable()) return null;
  const dir = join(tmpdir(), "snapotter-scratch", `preview-${randomUUID()}`);
  const output = join(dir, "poster.webp");
  let scratchStaged = false;
  try {
    await mkdir(dir, { recursive: true });
    const input = join(dir, "in");
    await writeFile(input, buffer);
    scratchStaged = true;
    await runFfmpeg(
      ["-ss", "0", "-i", input, "-frames:v", "1", "-vf", `scale=${PREVIEW_WIDTH}:-2`, output],
      { timeoutMs: 30_000 },
    );
    return await readFile(output);
  } catch (err) {
    if (!scratchStaged || (!isMissingPreviewOutput(err, output) && isPreviewServerFault(err))) {
      throw err;
    }
    logger.warn({ err }, "video poster preview failed");
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** First PDF page rendered to PNG via ghostscript, or null. */
export async function pdfFirstPagePreview(buffer: Buffer): Promise<Buffer | null> {
  const gs = resolveGs();
  if (!gs) return null;
  const dir = join(tmpdir(), "snapotter-scratch", `preview-${randomUUID()}`);
  const output = join(dir, "page1.png");
  let scratchStaged = false;
  try {
    await mkdir(dir, { recursive: true });
    const input = join(dir, "in.pdf");
    await writeFile(input, buffer);
    scratchStaged = true;
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        gs,
        [
          "-dSAFER",
          "-dBATCH",
          "-dNOPAUSE",
          "-dFirstPage=1",
          "-dLastPage=1",
          "-sDEVICE=png16m",
          "-r96",
          `-sOutputFile=${output}`,
          input,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let err = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("ghostscript preview timed out"));
      }, 30_000);
      child.stderr.on("data", (c: Buffer) => {
        err = (err + c.toString("utf8")).slice(-2048);
      });
      child.on("error", (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) resolvePromise();
        else reject(new Error(`gs exited ${code ?? signal}: ${err}`));
      });
    });
    return await readFile(output);
  } catch (err) {
    if (!scratchStaged || (!isMissingPreviewOutput(err, output) && isPreviewServerFault(err))) {
      throw err;
    }
    logger.warn({ err }, "pdf first-page preview failed");
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
