import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { autoOrient } from "../../lib/auto-orient.js";
import {
  type BackgroundOpts,
  generateBackground,
  getDominantBackground,
} from "../../lib/beautify/backgrounds.js";
import {
  type BeautifySettings,
  DEVICE_FRAMES,
  SHADOW_PRESETS,
  SOCIAL_PRESETS,
  settingsSchema,
} from "../../lib/beautify/constants.js";
import { renderFrame } from "../../lib/beautify/frames.js";
import { applyShadow } from "../../lib/beautify/shadow.js";
import { formatZodErrors } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { sanitizeFilename } from "../../lib/filename.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { putObject } from "../../lib/object-storage.js";
import { decompressSvgz, sanitizeSvg } from "../../lib/svg-sanitize.js";
import { registerToolProcessFn } from "../tool-factory.js";

const ALPHA_FORMATS = new Set(["png", "webp", "avif"]);

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Resolve shadow preset to concrete values. */
function resolveShadow(settings: BeautifySettings) {
  return settings.shadowPreset === "custom"
    ? {
        blur: settings.shadowBlur,
        offsetX: settings.shadowOffsetX,
        offsetY: settings.shadowOffsetY,
        color: settings.shadowColor,
        opacity: settings.shadowOpacity,
      }
    : SHADOW_PRESETS[settings.shadowPreset];
}

/** Check whether the output needs an alpha channel. */
function needsAlphaOutput(settings: BeautifySettings): boolean {
  const shadow = resolveShadow(settings);
  const hasShadow = shadow.opacity > 0 && shadow.blur > 0;
  return (
    hasShadow ||
    settings.borderRadius > 0 ||
    settings.backgroundType === "transparent" ||
    settings.frame !== "none"
  );
}

/** Compute the output filename with the correct extension. */
function resolveOutputFilename(filename: string, settings: BeautifySettings): string {
  const forcedPng = needsAlphaOutput(settings) && !ALPHA_FORMATS.has(settings.outputFormat);
  const ext = forcedPng ? ".png" : `.${settings.outputFormat}`;
  return filename.replace(/\.[^.]+$/, ext);
}

export async function processBeautify(
  inputBuffer: Buffer,
  settings: BeautifySettings,
  _filename: string,
  bgImageBuffer?: Buffer,
): Promise<Buffer> {
  // 1. Decode & Prepare
  let buf = inputBuffer;
  const validation = await validateImageBuffer(buf, _filename);
  if (validation.valid && validation.format === "heif") {
    buf = await decodeHeic(buf);
  }
  if (validation.valid && needsCliDecode(validation.format)) {
    try {
      const fileExt = _filename.split(".").pop()?.toLowerCase();
      buf = await decodeToSharpCompat(buf, validation.format, fileExt);
    } catch {
      await sharp(buf).metadata();
    }
  }
  if (validation.valid && validation.format === "svg") {
    buf = decompressSvgz(buf);
    buf = sanitizeSvg(buf);
  }
  buf = await autoOrient(buf);
  buf = await sharp(buf).ensureAlpha().png().toBuffer();

  // 2. Apply Border Radius (skip for device frames that have their own bezels)
  const hasDeviceFrame = settings.frame !== "none" && DEVICE_FRAMES.has(settings.frame);
  if (settings.borderRadius > 0 && !hasDeviceFrame) {
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 100;
    const h = meta.height ?? 100;
    const r = Math.min(settings.borderRadius, w / 2, h / 2);

    const mask = Buffer.from(
      `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`,
    );
    buf = await sharp(buf)
      .composite([{ input: await sharp(mask).resize(w, h).toBuffer(), blend: "dest-in" }])
      .png()
      .toBuffer();
  }

  // 3. Render Device/SVG Frame
  buf = await renderFrame(buf, settings.frame, settings.frameTitle);

  // 4-5. Resolve & Apply Shadow
  const shadowOpts = resolveShadow(settings);
  const hasShadow = shadowOpts.opacity > 0 && shadowOpts.blur > 0;
  if (hasShadow) {
    const result = await applyShadow(buf, shadowOpts);
    buf = result.buffer;
  }

  // 6. Generate Background
  const framedMeta = await sharp(buf).metadata();
  const framedW = framedMeta.width ?? 100;
  const framedH = framedMeta.height ?? 100;
  const padding = settings.padding;
  const canvasW = framedW + padding * 2;
  const canvasH = framedH + padding * 2;

  let bgOpts: BackgroundOpts;
  if (settings.backgroundType === "image" && bgImageBuffer) {
    bgOpts = { type: "image", imageBuffer: bgImageBuffer, width: canvasW, height: canvasH };
  } else if (settings.backgroundType === "solid") {
    bgOpts = { type: "solid", color: settings.backgroundColor, width: canvasW, height: canvasH };
  } else if (
    settings.backgroundType === "linear-gradient" ||
    settings.backgroundType === "radial-gradient"
  ) {
    bgOpts = {
      type: settings.backgroundType,
      stops: settings.gradientStops,
      angle: settings.gradientAngle,
      width: canvasW,
      height: canvasH,
    };
  } else {
    bgOpts = { type: "transparent", width: canvasW, height: canvasH };
  }

  const background = await generateBackground(bgOpts);

  // 7. Composite onto Background
  buf = await sharp(background)
    .composite([{ input: buf, left: padding, top: padding }])
    .png()
    .toBuffer();

  // 8. Apply Watermark
  if (settings.watermarkText) {
    const wmMeta = await sharp(buf).metadata();
    const wmW = wmMeta.width ?? canvasW;
    const wmH = wmMeta.height ?? canvasH;

    const fontSize = Math.max(12, Math.round(Math.min(wmW, wmH) * 0.03));
    const alpha = settings.watermarkOpacity / 100;
    const escaped = escapeXml(settings.watermarkText);

    let textX: number;
    let textY: number;
    let anchor: string;
    switch (settings.watermarkPosition) {
      case "top-left":
        textX = fontSize;
        textY = fontSize * 2;
        anchor = "start";
        break;
      case "top-right":
        textX = wmW - fontSize;
        textY = fontSize * 2;
        anchor = "end";
        break;
      case "bottom-left":
        textX = fontSize;
        textY = wmH - fontSize;
        anchor = "start";
        break;
      case "center":
        textX = wmW / 2;
        textY = wmH / 2;
        anchor = "middle";
        break;
      default:
        // bottom-right
        textX = wmW - fontSize;
        textY = wmH - fontSize;
        anchor = "end";
        break;
    }

    const wmSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wmW}" height="${wmH}">
  <text x="${textX}" y="${textY}" text-anchor="${anchor}" font-family="sans-serif" font-size="${fontSize}" fill="white" opacity="${alpha}">${escaped}</text>
</svg>`;

    buf = await sharp(buf)
      .composite([{ input: Buffer.from(wmSvg) }])
      .png()
      .toBuffer();
  }

  // 9. Resize to Social Preset
  const preset = SOCIAL_PRESETS[settings.socialPreset];
  if (preset) {
    const dominant = getDominantBackground({
      type: settings.backgroundType,
      color: settings.backgroundColor,
      stops: settings.gradientStops,
    });
    buf = await sharp(buf)
      .resize(preset.width, preset.height, {
        fit: "contain",
        background: dominant,
      })
      .png()
      .toBuffer();
  }

  // 10. Encode Output
  if (needsAlphaOutput(settings) && !ALPHA_FORMATS.has(settings.outputFormat)) {
    return sharp(buf).png().toBuffer();
  }

  switch (settings.outputFormat) {
    case "jpeg":
      return sharp(buf).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
    case "webp":
      return sharp(buf).webp({ quality: 90 }).toBuffer();
    default:
      return sharp(buf).png().toBuffer();
  }
}

export function registerBeautify(app: FastifyInstance) {
  // Custom HTTP route (multi-file upload: main image + optional background image)
  app.post("/api/v1/tools/image/beautify", async (request, reply) => {
    let mainBuffer: Buffer | null = null;
    let bgImageBuffer: Buffer | null = null;
    let filename = "image";
    let settingsRaw: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks);
          if (part.fieldname === "backgroundImage") {
            bgImageBuffer = buf;
          } else {
            mainBuffer = buf;
            filename = sanitizeFilename(part.filename ?? "image");
          }
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!mainBuffer || mainBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    let settings: BeautifySettings;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply
          .status(400)
          .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
    }

    try {
      const originalSize = mainBuffer.length;
      const outputBuf = await processBeautify(
        mainBuffer,
        settings,
        filename,
        bgImageBuffer ?? undefined,
      );
      const outFilename = resolveOutputFilename(filename, settings);

      const jobId = randomUUID();
      await putObject(`outputs/${jobId}/${outFilename}`, outputBuf);

      return reply.send({
        jobId,
        downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(outFilename)}`,
        originalSize,
        processedSize: outputBuf.length,
      });
    } catch (err) {
      return reply.status(422).send({
        error: "Processing failed",
        details: err instanceof Error ? err.message : "Image processing failed",
      });
    }
  });

  // Register for pipeline/batch support
  registerToolProcessFn({
    toolId: "beautify",
    settingsSchema,
    process: async (inputBuffer, settings, filename) => {
      const s = settings as BeautifySettings;
      if (s.backgroundType === "image") {
        throw new Error("Image backgrounds are not supported in pipeline mode.");
      }
      const buffer = await processBeautify(inputBuffer, s, filename);
      const outFilename = resolveOutputFilename(filename, s);
      const forcedPng = needsAlphaOutput(s) && !ALPHA_FORMATS.has(s.outputFormat);
      const ext = forcedPng ? "png" : s.outputFormat;
      const contentType =
        ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
      return { buffer, filename: outFilename, contentType };
    },
  });
}
