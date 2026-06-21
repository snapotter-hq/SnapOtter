import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";

const settingsSchema = z
  .object({
    count: z.number().int().min(2).max(16).default(8),
    format: z.enum(["hex", "rgb", "hsl"]).default("hex"),
  })
  .default({});

// ── Color format helpers ─────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbToRgbString(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function rgbToHsl(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function formatColor(r: number, g: number, b: number, fmt: "hex" | "rgb" | "hsl"): string {
  if (fmt === "rgb") return rgbToRgbString(r, g, b);
  if (fmt === "hsl") return rgbToHsl(r, g, b);
  return rgbToHex(r, g, b);
}

// ── Median-cut quantization ──────────────────────────────────────

interface ColorBucket {
  pixels: Array<[number, number, number]>;
}

function rangeOfChannel(pixels: Array<[number, number, number]>, ch: 0 | 1 | 2): number {
  let min = 255;
  let max = 0;
  for (const px of pixels) {
    if (px[ch] < min) min = px[ch];
    if (px[ch] > max) max = px[ch];
  }
  return max - min;
}

function medianCut(
  pixels: Array<[number, number, number]>,
  maxColors: number,
): Array<{ r: number; g: number; b: number; count: number }> {
  if (pixels.length === 0) return [];

  const buckets: ColorBucket[] = [{ pixels }];

  // Split until we have enough buckets or can't split further
  while (buckets.length < maxColors) {
    // Pick the bucket with the widest channel range. bestRange starts at 0 so a
    // uniform bucket (range 0) is never chosen -- otherwise a solid-color image
    // would keep splitting into identical swatches.
    let bestIdx = -1;
    let bestRange = 0;
    let bestCh: 0 | 1 | 2 = 0;

    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].pixels.length < 2) continue;
      for (const ch of [0, 1, 2] as const) {
        const r = rangeOfChannel(buckets[i].pixels, ch);
        if (r > bestRange) {
          bestRange = r;
          bestIdx = i;
          bestCh = ch;
        }
      }
    }

    if (bestIdx === -1) break; // nothing left to split

    const bucket = buckets[bestIdx];
    bucket.pixels.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = Math.floor(bucket.pixels.length / 2);
    buckets.splice(
      bestIdx,
      1,
      { pixels: bucket.pixels.slice(0, mid) },
      { pixels: bucket.pixels.slice(mid) },
    );
  }

  // Average each bucket to get representative colors, sorted by population
  return buckets
    .filter((b) => b.pixels.length > 0)
    .map((b) => {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (const px of b.pixels) {
        rSum += px[0];
        gSum += px[1];
        bSum += px[2];
      }
      const n = b.pixels.length;
      return {
        r: Math.round(rSum / n),
        g: Math.round(gSum / n),
        b: Math.round(bSum / n),
        count: n,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * Extract dominant colors via median-cut quantization.
 */
function extractColors(
  pixels: Buffer,
  channelCount: number,
  maxColors: number,
  fmt: "hex" | "rgb" | "hsl",
): { colors: string[]; hex: string[] } {
  const pxArray: Array<[number, number, number]> = [];
  for (let i = 0; i < pixels.length; i += channelCount) {
    pxArray.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  }

  const representatives = medianCut(pxArray, maxColors);

  return {
    colors: representatives.map((c) => formatColor(c.r, c.g, c.b, fmt)),
    hex: representatives.map((c) => rgbToHex(c.r, c.g, c.b)),
  };
}

export function registerColorPalette(app: FastifyInstance) {
  app.post("/api/v1/tools/image/color-palette", async (request, reply) => {
    let fileBuffer: Buffer | null = null;
    let filename = "image";
    let rawSettings: string | undefined;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
          filename = sanitizeFilename(part.filename ?? "image");
        } else if (part.fieldname === "settings") {
          rawSettings = part.value as string;
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    // Parse and validate settings
    let parsed: { count: number; format: "hex" | "rgb" | "hsl" };
    try {
      const json = rawSettings ? JSON.parse(rawSettings) : {};
      parsed = settingsSchema.parse(json);
    } catch (err) {
      return reply.status(400).send({
        error: "Invalid settings",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }
      if (validation.format === "heif") {
        try {
          fileBuffer = await decodeHeic(fileBuffer);
        } catch (err) {
          return reply.status(422).send({
            error: "Failed to decode HEIC file. Ensure libheif-examples is installed.",
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (needsCliDecode(validation.format)) {
        try {
          const fileExt = filename.split(".").pop()?.toLowerCase();
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format, fileExt);
        } catch {
          try {
            await sharp(fileBuffer).metadata();
          } catch (err) {
            return reply.status(422).send({
              error: `Failed to decode ${validation.format.toUpperCase()} file`,
              details: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      if (validation.format === "svg") {
        try {
          fileBuffer = decompressSvgz(fileBuffer);
          fileBuffer = sanitizeSvg(fileBuffer);
        } catch (err) {
          return reply.status(400).send({
            error: err instanceof Error ? err.message : "Invalid SVG",
          });
        }
      }

      // Resize to small image for analysis (100x100 for better sampling)
      const raw = await sharp(fileBuffer)
        .resize(100, 100, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer();

      const { colors, hex } = extractColors(raw, 3, parsed.count, parsed.format);

      return reply.send({
        filename,
        colors,
        hex,
        count: colors.length,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Color extraction failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
