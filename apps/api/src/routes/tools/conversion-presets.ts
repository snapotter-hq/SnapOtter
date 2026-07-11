import { BASE_CONFIG, CONVERSION_PRESETS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute, getToolConfig } from "../tool-factory.js";
import { registerImageToPdfPreset } from "./image-to-pdf.js";
import { registerPdfToImagePreset } from "./pdf-to-image.js";
import { registerSvgToRasterPreset } from "./svg-to-raster.js";

/**
 * Narrow settings schema per preset base. Presets lock the output format, so
 * they expose only an optional quality/video knob (or nothing). The locked
 * format is merged in before the base's own processV2 re-validates.
 */
function presetSchema(base: string) {
  if (base === "convert" || base === "svg-to-raster") {
    return z.object({ quality: z.number().min(1).max(100).optional() });
  }
  if (base === "convert-video") {
    return z.object({ quality: z.enum(["high", "balanced", "small"]).optional() });
  }
  if (base === "image-to-pdf") {
    return z.object({
      pageSize: z.enum(["A4", "Letter", "A3", "A5"]).optional(),
      orientation: z.enum(["portrait", "landscape"]).optional(),
    });
  }
  return z.object({});
}

/**
 * Register all conversion-preset routes. Registry-group presets delegate to the
 * base tool's registered processV2 with their locked settings merged in, so they
 * MUST be registered after the base tools (ensured by index.ts ordering). The
 * three custom ZIP bases (image-to-pdf, pdf-to-image, svg-to-raster) reuse their
 * own parameterized registrars.
 */
export function registerConversionPresets(app: FastifyInstance): number {
  let skipped = 0;
  for (const preset of CONVERSION_PRESETS) {
    const cfg = BASE_CONFIG[preset.base];
    if (cfg.group === "image-to-pdf") {
      registerImageToPdfPreset(app, preset.id, preset.sourceInputs);
      continue;
    }
    if (cfg.group === "pdf-to-image") {
      registerPdfToImagePreset(app, preset.id, preset.locked.format as string);
      continue;
    }
    if (cfg.group === "svg-to-raster") {
      registerSvgToRasterPreset(app, preset.id, preset.locked.outputFormat as string);
      continue;
    }

    // group "registry": delegate to the base tool's processV2 with locked settings merged in.
    const baseConfig = getToolConfig(preset.base);
    if (!baseConfig) {
      // A missing base must degrade to a disabled preset, not a boot crash:
      // one bad environment crash-looped an instance 287 times (Sentry
      // NODE-21). CI still fails hard via the tool-route drift test, so the
      // official image can't ship with a hole.
      app.log.error(
        { presetId: preset.id, base: preset.base },
        "conversion preset base tool missing; preset disabled",
      );
      skipped++;
      continue;
    }
    createToolRoute(app, {
      toolId: preset.id,
      settingsSchema: presetSchema(preset.base),
      process: async () => {
        throw new Error(`${preset.id} is v2-only`);
      },
      processV2: async (ctx) => {
        const merged = { ...preset.locked, ...(ctx.settings as Record<string, unknown>) };
        if (!baseConfig.processV2) {
          throw new Error(`Base "${preset.base}" has no processV2 for preset "${preset.id}"`);
        }
        return baseConfig.processV2({ ...ctx, settings: merged });
      },
    });
  }

  return CONVERSION_PRESETS.length - skipped;
}
