import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveGs } from "@snapotter/doc-engine";
import { ffmpegAvailable, runFfmpeg } from "@snapotter/media-engine";

const PREVIEW_WIDTH = 480;

/** Video poster frame as WebP, or null when ffmpeg is unavailable/fails. */
export async function videoPosterPreview(buffer: Buffer): Promise<Buffer | null> {
  if (!ffmpegAvailable()) return null;
  const dir = join(tmpdir(), "snapotter-scratch", `preview-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  try {
    const input = join(dir, "in");
    const output = join(dir, "poster.webp");
    await writeFile(input, buffer);
    await runFfmpeg(
      ["-ss", "0", "-i", input, "-frames:v", "1", "-vf", `scale=${PREVIEW_WIDTH}:-2`, output],
      { timeoutMs: 30_000 },
    );
    return await readFile(output);
  } catch {
    return null; // previews must never fail the job
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** First PDF page rendered to PNG via ghostscript, or null. */
export async function pdfFirstPagePreview(buffer: Buffer): Promise<Buffer | null> {
  const gs = resolveGs();
  if (!gs) return null;
  const dir = join(tmpdir(), "snapotter-scratch", `preview-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  try {
    const input = join(dir, "in.pdf");
    const output = join(dir, "page1.png");
    await writeFile(input, buffer);
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
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
