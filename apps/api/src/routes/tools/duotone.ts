import { SafeError } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { z } from "zod";
import { runPerFrame } from "../../lib/animated-image.js";
import { asInputErrorIfUndecodable, withImageEncodeContext } from "../../lib/image-error.js";
import { outputFormatFor, resolveOutputFormat } from "../../lib/output-format.js";
import { createToolRoute } from "../tool-factory.js";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const settingsSchema = z.object({
  shadow: hexColor.default("#1e3a8a"),
  highlight: hexColor.default("#fbbf24"),
  intensity: z.number().int().min(0).max(100).default(100),
});

function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function registerDuotone(app: FastifyInstance) {
  createToolRoute(app, {
    toolId: "duotone",
    settingsSchema,
    process: withImageEncodeContext<z.infer<typeof settingsSchema>>(
      "Duotone failed",
      () => "duotone",
      async (inputBuffer, settings, filename) => {
        const resolvedFormat = await resolveOutputFormat(inputBuffer, filename);
        const ALPHA_FORMATS = new Set(["png", "webp", "avif", "gif"]);
        const inputHasAlpha = (await sharp(inputBuffer).metadata()).hasAlpha === true;
        // A transparent input whose detected format cannot carry alpha (JPEG, or
        // TIFF which Sharp's default encoder flattens to 3 channels) switches to
        // lossless PNG so the rejoined alpha band is not discarded at the end (#1188).
        const outputFormat =
          inputHasAlpha && !ALPHA_FORMATS.has(resolvedFormat.format)
            ? outputFormatFor("png")
            : resolvedFormat;

        // The blend path rebuilds from a raw buffer, and Sharp ignores page hints
        // on raw input, so animation is handled a frame at a time (#1083).
        const core = async (source: Buffer): Promise<Buffer> => {
          const a = parseHex(settings.shadow);
          const b = parseHex(settings.highlight);
          const k = settings.intensity / 100;

          // Duotone math: output = shadow + (highlight - shadow) * luminance
          // .linear(multipliers, offsets) with per-channel arrays
          const multipliers = [(b.r - a.r) / 255, (b.g - a.g) / 255, (b.b - a.b) / 255];
          const offsets = [a.r, a.g, a.b];

          // Hold the alpha band aside as a named PNG intermediate so the colour
          // ramp and optional intensity blend can run over 3-channel sRGB without
          // transforming or losing transparency (#1188, #1180).
          const meta = await sharp(source).metadata();
          const alpha = meta.hasAlpha
            ? await sharp(source).extractChannel(3).png().toBuffer()
            : undefined;

          // Grayscale to single channel, then expand back to 3-channel sRGB
          // so that .linear() can apply per-channel multipliers/offsets.
          //
          // The .png() is load-bearing. A bare toBuffer() re-encodes in whatever
          // the input was, and Sharp's GIF writer reuses the palette it read the
          // image in with, so a grayscale ramp has to be expressed in the colors
          // the source happened to contain. A flat red GIF has no grays in its
          // palette at all and the result bears no relation to the input: red,
          // green and blue all came out as 76,105,113 (issue #1180). A GIF whose
          // palette already holds grays round-trips fine, which is why photographs
          // mostly survived this and it went unnoticed. PNG then carries through
          // the rest of the chain.
          const grayBuf = await sharp(source)
            .removeAlpha()
            .grayscale()
            .toColourspace("srgb")
            .png()
            .toBuffer();

          let buf = await sharp(grayBuf).linear(multipliers, offsets).toBuffer();

          // Blend duotone with original when intensity < 100. Both buffers are read
          // through the same removeAlpha + sRGB pipeline so they share channel count
          // and length, and the blended raw buffer is re-encoded to PNG so the final
          // toFormat() step can decode it again.
          if (k < 1) {
            const origRaw = await sharp(source)
              .removeAlpha()
              .toColourspace("srgb")
              .raw()
              .toBuffer({ resolveWithObject: true });
            const duo = await sharp(buf).removeAlpha().toColourspace("srgb").raw().toBuffer();
            const pixels = origRaw.data;
            if (duo.length !== pixels.length) {
              throw new SafeError(
                `duotone blend: duotone buffer is ${duo.length} bytes, original is ${pixels.length} ` +
                  `(${origRaw.info.width}x${origRaw.info.height}x${origRaw.info.channels})`,
                { kind: "bug", code: "duotone" },
              );
            }
            const blended = Buffer.alloc(pixels.length);
            for (let i = 0; i < pixels.length; i++) {
              blended[i] = Math.round(pixels[i] * (1 - k) + duo[i] * k);
            }
            buf = await sharp(blended, {
              raw: {
                width: origRaw.info.width,
                height: origRaw.info.height,
                channels: origRaw.info.channels,
              },
            })
              .png()
              .toBuffer();
          }

          if (alpha) {
            buf = await sharp(buf).joinChannel(alpha).png().toBuffer();
          }

          return await sharp(buf)
            .toFormat(outputFormat.format, outputFormat.encoderOptions)
            .toBuffer();
        };

        let buffer: Buffer;
        try {
          buffer =
            (await runPerFrame(inputBuffer, outputFormat.format, core)) ??
            (await core(inputBuffer));
        } catch (err) {
          throw await asInputErrorIfUndecodable(inputBuffer, err);
        }
        const base = filename.replace(/\.[^.]+$/, "");
        const ext = outputFormat.extension;
        return {
          buffer,
          filename: `${base}_duotone.${ext}`,
          contentType: outputFormat.contentType,
        };
      },
    ),
  });
}
