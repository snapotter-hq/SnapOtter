import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { qoiEncode } from "@snapotter/image-engine";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

let cachedMagickCmd: string | null = null;

async function findMagickCmd(): Promise<string> {
  if (cachedMagickCmd) return cachedMagickCmd;
  for (const cmd of ["magick", "convert"]) {
    try {
      await execFileAsync(cmd, ["--version"], { timeout: 5_000 });
      cachedMagickCmd = cmd;
      return cmd;
    } catch {
      /* try next */
    }
  }
  throw new Error("No ImageMagick found.");
}

function magickArgs(cmd: string, args: string[]): string[] {
  return cmd === "magick" ? ["convert", ...args] : args;
}

export async function encodeBmp(inputBuffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `bmp-enc-in-${id}.png`);
  const outputPath = join(tmpdir(), `bmp-enc-out-${id}.bmp`);
  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `bmp3:${outputPath}`]), {
      timeout: 60_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

export async function encodeIco(inputBuffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `ico-enc-in-${id}.png`);
  const outputPath = join(tmpdir(), `ico-enc-out-${id}.ico`);
  try {
    const pngBuffer = await sharp(inputBuffer)
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    await writeFile(inputPath, pngBuffer);
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `ico:${outputPath}`]), {
      timeout: 60_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

export async function encodeJp2(inputBuffer: Buffer, quality?: number): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `jp2-enc-in-${id}.png`);
  const outputPath = join(tmpdir(), `jp2-enc-out-${id}.jp2`);
  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    try {
      const rate = quality ? String(Math.max(1, Math.round(quality / 10))) : "5";
      await execFileAsync("opj_compress", ["-i", inputPath, "-o", outputPath, "-r", rate], {
        timeout: 60_000,
      });
      return await readFile(outputPath);
    } catch {
      /* fall back to ImageMagick */
    }
    const cmd = await findMagickCmd();
    const q = quality ? ["-quality", String(quality)] : [];
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, ...q, `jp2:${outputPath}`]), {
      timeout: 60_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

export async function encodeQoi(inputBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const encoded = qoiEncode(new Uint8Array(data), info.width, info.height, 4);
  return Buffer.from(encoded);
}

export async function encodePpm(inputBuffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `ppm-enc-in-${id}.png`);
  const outputPath = join(tmpdir(), `ppm-enc-out-${id}.ppm`);
  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `ppm:${outputPath}`]), {
      timeout: 60_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

export async function encodeEps(inputBuffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `eps-enc-in-${id}.png`);
  const outputPath = join(tmpdir(), `eps-enc-out-${id}.eps`);
  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `eps:${outputPath}`]), {
      timeout: 60_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

export async function encodeTga(inputBuffer: Buffer): Promise<Buffer> {
  const cmd = await findMagickCmd();
  const id = randomUUID();
  const inputPath = join(tmpdir(), `tga-enc-in-${id}.png`);
  const outputPath = join(tmpdir(), `tga-enc-out-${id}.tga`);
  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, `tga:${outputPath}`]), {
      timeout: 60_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

export async function encodeMultiIco(pngPaths: string[], outputPath: string): Promise<void> {
  const cmd = await findMagickCmd();
  const args =
    cmd === "magick" ? [...pngPaths, `ico:${outputPath}`] : [...pngPaths, `ico:${outputPath}`];
  await execFileAsync(cmd, cmd === "magick" ? ["convert", ...args] : args, {
    timeout: 60_000,
  });
}

/**
 * Check whether ImageMagick is available on this system.
 * Returns true if magick or convert can be found; false otherwise.
 */
export async function hasMagick(): Promise<boolean> {
  try {
    await findMagickCmd();
    return true;
  } catch {
    return false;
  }
}

export async function encodeJxl(inputBuffer: Buffer, quality?: number): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `jxl-enc-in-${id}.png`);
  const outputPath = join(tmpdir(), `jxl-enc-out-${id}.jxl`);
  try {
    const pngBuffer = await sharp(inputBuffer).png().toBuffer();
    await writeFile(inputPath, pngBuffer);
    try {
      const q = String(quality ?? 75);
      await execFileAsync("cjxl", [inputPath, outputPath, "-q", q], {
        timeout: 120_000,
      });
      return await readFile(outputPath);
    } catch {
      /* cjxl not available, fall back to ImageMagick */
    }
    const cmd = await findMagickCmd();
    const q = quality ? ["-quality", String(quality)] : [];
    await execFileAsync(cmd, magickArgs(cmd, [inputPath, ...q, `jxl:${outputPath}`]), {
      timeout: 120_000,
    });
    return await readFile(outputPath);
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(outputPath, { force: true }).catch(() => {});
  }
}
