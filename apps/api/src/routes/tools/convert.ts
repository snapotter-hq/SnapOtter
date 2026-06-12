import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { convert } from "@snapotter/image-engine";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import {
  encodeBmp,
  encodeEps,
  encodeIco,
  encodeJp2,
  encodeJxl,
  encodePpm,
  encodeQoi,
  encodeTga,
} from "../../lib/format-encoders.js";
import { encodeHeic } from "../../lib/heic-converter.js";
import { isSvgBuffer } from "../../lib/svg-sanitize.js";
import { createToolRoute } from "../tool-factory.js";

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
      // try next
    }
  }
  throw new Error("No ImageMagick found. Install imagemagick (provides convert/magick).");
}

function magickArgs(cmd: string, args: string[]): string[] {
  return cmd === "magick" ? ["convert", ...args] : args;
}

const FORMAT_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jxl: "image/jxl",
  bmp: "image/bmp",
  ico: "image/x-icon",
  jp2: "image/jp2",
  qoi: "image/x-qoi",
  psd: "image/vnd.adobe.photoshop",
  ppm: "image/x-portable-pixmap",
  eps: "application/postscript",
  tga: "image/x-tga",
};

const CLI_ENCODERS: Record<string, (buf: Buffer, quality?: number) => Promise<Buffer>> = {
  bmp: encodeBmp,
  eps: encodeEps,
  ico: encodeIco,
  jp2: encodeJp2,
  jxl: encodeJxl,
  ppm: encodePpm,
  qoi: encodeQoi,
  tga: encodeTga,
};

const ANIMATABLE_FORMATS = new Set(["gif", "webp"]);

const settingsSchema = z.object({
  format: z.enum([
    "jpg",
    "png",
    "webp",
    "avif",
    "tiff",
    "gif",
    "heic",
    "heif",
    "jxl",
    "bmp",
    "ico",
    "jp2",
    "qoi",
    "psd",
    "ppm",
    "eps",
    "tga",
  ]),
  quality: z.number().min(1).max(100).optional(),
});

export function registerConvert(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "convert",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      // CLI-encoded formats bypass Sharp entirely
      const cliEncoder = CLI_ENCODERS[settings.format];
      if (cliEncoder) {
        const outputBuffer = await cliEncoder(inputBuffer, settings.quality);
        const ext = extname(filename);
        const baseName = ext ? filename.slice(0, -ext.length) : filename;
        const contentType = FORMAT_CONTENT_TYPES[settings.format] || "application/octet-stream";
        return {
          buffer: outputBuffer,
          filename: `${baseName}.${settings.format}`,
          contentType,
        };
      }

      const inputExt = extname(filename).toLowerCase().replace(".", "");
      const sharpOpts: import("sharp").SharpOptions = isSvgBuffer(inputBuffer)
        ? { density: 300 }
        : {};
      // Preserve animation frames when both input and output are animatable formats
      if (ANIMATABLE_FORMATS.has(inputExt) && ANIMATABLE_FORMATS.has(settings.format)) {
        sharpOpts.animated = true;
      }
      const image = sharp(inputBuffer, sharpOpts);

      let buffer: Buffer;
      if (settings.format === "psd") {
        const pngBuffer = await image.png().toBuffer();
        const id = randomUUID();
        const inputPath = join(tmpdir(), `psd-enc-in-${id}.png`);
        const outputPath = join(tmpdir(), `psd-enc-out-${id}.psd`);
        try {
          await writeFile(inputPath, pngBuffer);
          const cmd = await findMagickCmd();
          await execFileAsync(cmd, magickArgs(cmd, [inputPath, `psd:${outputPath}`]), {
            timeout: 120_000,
          });
          buffer = await readFile(outputPath);
        } finally {
          await rm(inputPath, { force: true }).catch(() => {});
          await rm(outputPath, { force: true }).catch(() => {});
        }
      } else if (settings.format === "heic" || settings.format === "heif") {
        const pngBuffer = await image.png().toBuffer();
        buffer = await encodeHeic(pngBuffer, settings.quality);
      } else {
        const result = await convert(image, settings as Parameters<typeof convert>[1]);
        buffer = await result.toBuffer();
      }

      // Change filename extension to match the output format
      const ext = extname(filename);
      const baseName = ext ? filename.slice(0, -ext.length) : filename;
      const outputFilename = `${baseName}.${settings.format}`;

      const contentType = FORMAT_CONTENT_TYPES[settings.format] || "application/octet-stream";

      return { buffer, filename: outputFilename, contentType };
    },
  });
}
