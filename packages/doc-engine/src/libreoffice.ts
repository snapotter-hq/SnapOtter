import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveSoffice } from "./binaries.js";

export interface ConvertOptions {
  timeoutMs?: number; // default 120s, spec 4.7 hard kill
}

/**
 * LibreOffice headless conversion with per-invocation profile isolation
 * (spec 4.7): each run gets its own UserInstallation dir so concurrent
 * conversions cannot corrupt a shared profile; the profile is removed in
 * finally and the process is SIGKILLed at the deadline.
 * Returns the produced file path inside outDir.
 */
export async function convertDocument(
  inputPath: string,
  outDir: string,
  targetExt: string,
  opts: ConvertOptions = {},
): Promise<string> {
  const bin = resolveSoffice();
  if (!bin) throw new Error("soffice binary not found (set SOFFICE_PATH or install LibreOffice)");
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const profileDir = join(tmpdir(), `snapotter-lo-${randomUUID()}`);
  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(
        bin,
        [
          `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
          "--headless",
          "--norestore",
          "--nolockcheck",
          "--nodefault",
          "--convert-to",
          targetExt,
          "--outdir",
          outDir,
          inputPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
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
    const expected = `${basename(inputPath, extname(inputPath))}.${targetExt}`;
    const produced = (await readdir(outDir)).find((f) => f === expected);
    if (!produced)
      throw new Error(`LibreOffice produced no ${targetExt} output for ${basename(inputPath)}`);
    return join(outDir, produced);
  } finally {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}
