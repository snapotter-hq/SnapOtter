import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, constants, readdir, rm, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  engineCrashError,
  engineCrashSignal,
  ToolInputError,
  wrapWithMemoryLimit,
} from "@snapotter/shared";
import { resolveSoffice } from "./binaries.js";

export interface ConvertOptions {
  timeoutMs?: number; // default 120s, spec 4.7 hard kill
  signal?: AbortSignal;
}

const LIBREOFFICE_CRASHED_MESSAGE =
  "The document engine (LibreOffice) crashed while processing this file.";

function libreofficeSpawnFailure(
  bin: string,
  code: null | 126 | 127,
  signal: NodeJS.Signals | null,
  output: string,
): NodeJS.ErrnoException {
  const errno = code === 127 ? "ENOENT" : code === 126 ? "ENOEXEC" : "ENOMEM";
  const detail = output.slice(-1000).trim();
  const msg = detail ? `LibreOffice exited ${code ?? signal}: ${detail}` : `spawn ${bin} ${errno}`;
  return Object.assign(new Error(msg), {
    code: errno,
    syscall: "spawn",
    path: bin,
    ...(signal ? { signal } : {}),
  });
}

// LibreOffice reports a store that ran out of room as an Io/Space error code
// (ERRCODE_IO_OUTOFSPACE) on stderr, then usually exits 0 with no output.
const OUT_OF_SPACE = /Error Area:Io Class:Space\b/;
// When the volume has no free blocks at all, it can't even create the output
// file and logs an Io/Access error instead, the same one a read-only output
// directory produces (#4529).
const ACCESS_DENIED = /Error Area:Io Class:Access\b/;
// LibreOffice's own word for an input it couldn't open: a truncated or
// corrupt file, a password-protected one, or one whose contents don't match
// its extension. It still exits 0, just without writing anything (#4380).
const SOURCE_NOT_LOADED = /source file could not be loaded/i;
const UNREADABLE_DOCUMENT_MESSAGE =
  "This document couldn't be opened. It may be damaged, password-protected, or not the format its extension says.";
// A volume that reads as full can still report a few blocks free, reserved
// for root or filesystem metadata, so "full" is anything under this.
const FULL_DISK_FREE_BYTES = 1024 * 1024;

async function outputVolumeIsFull(outDir: string): Promise<boolean | undefined> {
  try {
    const { bavail, bsize } = await statfs(outDir);
    return bavail * bsize < FULL_DISK_FREE_BYTES;
  } catch {
    return undefined;
  }
}

/** The errno a write into outDir is refused with, or undefined when it's writable. */
async function outputDirWriteRefusal(outDir: string): Promise<string | undefined> {
  try {
    await access(outDir, constants.W_OK);
    return undefined;
  } catch (e) {
    const { code } = e as NodeJS.ErrnoException;
    return code === "EACCES" || code === "EPERM" || code === "EROFS" ? code : undefined;
  }
}

/**
 * Gives a failed conversion the errno its store error means, shaped like a
 * failed write, so callers answer a full disk (#4148, #4529) or an unwritable
 * output directory as the server's storage fault rather than a document
 * LibreOffice couldn't read. An access error is told apart by the output
 * volume's free space, then by whether the directory refuses writes; when
 * neither explains it, the error stays untagged.
 */
async function failure(message: string, stderr: string, outDir: string): Promise<Error> {
  const err = new Error(message);
  if (OUT_OF_SPACE.test(stderr)) return Object.assign(err, { code: "ENOSPC", syscall: "write" });
  if (!ACCESS_DENIED.test(stderr)) return err;
  if (await outputVolumeIsFull(outDir)) {
    return Object.assign(err, { code: "ENOSPC", syscall: "write" });
  }
  const refusal = await outputDirWriteRefusal(outDir);
  return refusal ? Object.assign(err, { code: refusal, syscall: "open", path: outDir }) : err;
}

/**
 * Split a target string into the output file extension and the full
 * --convert-to argument. Bare extensions ("pdf") pass through unchanged.
 * Qualified targets ("docx:MS Word 2007 XML") split on the FIRST colon:
 * the part before it is the output extension, the full string is the
 * --convert-to value.
 */
export function parseConvertTarget(target: string): { ext: string; convertTo: string } {
  const idx = target.indexOf(":");
  if (idx === -1) return { ext: target, convertTo: target };
  return { ext: target.slice(0, idx), convertTo: target };
}

/**
 * LibreOffice headless conversion with per-invocation profile isolation
 * (spec 4.7): each run gets its own UserInstallation dir so concurrent
 * conversions cannot corrupt a shared profile; the profile is removed in
 * finally and the process is SIGKILLed at the deadline.
 *
 * target may be a bare extension ("pdf") or "ext:Filter Name"
 * ("docx:MS Word 2007 XML"). The extension controls the output filename;
 * the full string is passed to --convert-to.
 *
 * Returns the produced file path inside outDir.
 */
export async function convertDocument(
  inputPath: string,
  outDir: string,
  target: string,
  opts: ConvertOptions = {},
): Promise<string> {
  if (opts.signal?.aborted) {
    throw new Error("Canceled");
  }
  const bin = resolveSoffice();
  if (!bin) throw new Error("soffice binary not found (set SOFFICE_PATH or install LibreOffice)");
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const profileDir = join(tmpdir(), `snapotter-lo-${randomUUID()}`);
  const { ext, convertTo } = parseConvertTarget(target);
  let err = "";
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const [limBin, limArgs] = wrapWithMemoryLimit(bin, [
        `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
        "--headless",
        "--norestore",
        "--nolockcheck",
        "--nodefault",
        "--convert-to",
        convertTo,
        "--outdir",
        outDir,
        inputPath,
      ]);
      const child = spawn(limBin, limArgs, { stdio: ["ignore", "pipe", "pipe"] });
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        child.kill("SIGKILL");
        reject(new Error("Canceled"));
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        opts.signal?.removeEventListener("abort", onAbort);
        child.kill("SIGKILL");
        reject(new Error(`LibreOffice timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
      child.stderr.on("data", (c: Buffer) => {
        err = (err + c.toString("utf8")).slice(-4096);
      });
      child.on("error", (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        reject(e);
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        if (code === 0) {
          resolvePromise();
          return;
        }
        const crashSignal = engineCrashSignal(code, signal);
        if (crashSignal) {
          reject(engineCrashError(LIBREOFFICE_CRASHED_MESSAGE, "LibreOffice", crashSignal, err));
          return;
        }
        if (code === null || code === 126 || code === 127) {
          reject(libreofficeSpawnFailure(bin, code, signal, err));
          return;
        }
        void failure(`LibreOffice exited ${code}: ${err.slice(-1000)}`, err, outDir).then(reject);
      });
      opts.signal?.addEventListener("abort", onAbort, { once: true });
    });
    const expected = `${basename(inputPath, extname(inputPath))}.${ext}`;
    const produced = (await readdir(outDir)).find((f) => f === expected);
    if (!produced) {
      const noOutput = await failure(
        `LibreOffice produced no ${ext} output for ${basename(inputPath)}`,
        err,
        outDir,
      );
      if ((noOutput as NodeJS.ErrnoException).code !== undefined) throw noOutput;
      if (SOURCE_NOT_LOADED.test(err)) {
        throw new ToolInputError(UNREADABLE_DOCUMENT_MESSAGE, {
          cause: noOutput,
          code: "DOCUMENT_UNREADABLE",
        });
      }
      // Anything else is unexplained, so keep LibreOffice's own words with it
      // for triage (NODE-35 events carried no stderr at all).
      if (err.trim()) noOutput.cause = new Error(`LibreOffice stderr: ${err.slice(-1000).trim()}`);
      throw noOutput;
    }
    return join(outDir, produced);
  } finally {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}
