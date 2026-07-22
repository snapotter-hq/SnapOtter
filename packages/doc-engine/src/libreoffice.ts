import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { wrapWithMemoryLimit } from "@snapotter/shared";
import { resolveSoffice } from "./binaries.js";

export interface ConvertOptions {
  timeoutMs?: number; // default 120s, spec 4.7 hard kill
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
  const bin = resolveSoffice();
  if (!bin) throw new Error("soffice binary not found (set SOFFICE_PATH or install LibreOffice)");
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const profileDir = join(tmpdir(), `snapotter-lo-${randomUUID()}`);
  const { ext, convertTo } = parseConvertTarget(target);
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
      let err = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
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
        reject(e);
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) resolvePromise();
        else reject(new Error(`LibreOffice exited ${code ?? signal}: ${err.slice(-1000)}`));
      });
    });
    const expected = `${basename(inputPath, extname(inputPath))}.${ext}`;
    const produced = (await readdir(outDir)).find((f) => f === expected);
    if (!produced)
      throw new Error(`LibreOffice produced no ${ext} output for ${basename(inputPath)}`);
    return join(outDir, produced);
  } finally {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}
