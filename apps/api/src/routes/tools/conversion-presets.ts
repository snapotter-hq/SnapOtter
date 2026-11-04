import { BASE_CONFIG, COMPRESS_PRESETS, CONVERSION_PRESETS } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createToolRoute, getToolConfig } from "../tool-factory.js";
import { registerImageToPdfPreset } from "./image-to-pdf.js";
import { registerPdfToImagePreset } from "./pdf-to-image.js";
import { registerSvgToRasterPreset } from "./svg-to-raster.js";

/**
 * Narrow settings schema per preset base. Presets lock the output format, so
 * they expose only an optional quality/video knob (or nothing). The locked
 * format is merged in before the base's own processV2 re-validates. Only
 * registry-group bases reach this; the three custom ZIP bases register through
 * their own parameterized registrars.
 */
function presetSchema(base: string) {
  if (base === "convert") {
    return z.object({ quality: z.number().int().min(1).max(100).optional() });
  }
  if (base === "convert-video") {
    return z.object({ quality: z.enum(["high", "balanced", "small"]).optional() });
  }
  return z.object({});
}

/**
 * Register all conversion-preset routes. Registry-group presets delegate to the
 * base tool's registered processV2 with their locked settings merged in, so they
 * MUST be registered after the base tools (ensured by index.ts ordering). The
 * three custom ZIP bases (image-to-pdf, pdf-to-image, svg-to-raster) reuse their
 * own parameterized registrars.
 *
 * A preset is skipped when `skipTools` holds its own id or its base id, so
 * disabling a tool closes every route that runs it. The ZIP registrars and
 * the compress presets would otherwise stay live after the base is disabled.
 * `skippedByPolicy` counts those; presets lost to a missing base are not in it.
 */
export function registerConversionPresets(
  app: FastifyInstance,
  skipTools: ReadonlySet<string> = new Set(),
): { registered: number; skippedByPolicy: number } {
  let skipped = 0;
  let skippedByPolicy = 0;
  const isSkipped = (preset: { id: string; base: string }) =>
    skipTools.has(preset.id) || skipTools.has(preset.base);
  for (const preset of CONVERSION_PRESETS) {
    if (isSkipped(preset)) {
      skippedByPolicy++;
      continue;
    }
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

  for (const preset of COMPRESS_PRESETS) {
    if (isSkipped(preset)) {
      skippedByPolicy++;
      continue;
    }
    const baseConfig = getToolConfig(preset.base);
    if (!baseConfig) {
      app.log.error(
        { presetId: preset.id, base: preset.base },
        "compress preset base tool missing; preset disabled",
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

  return {
    registered: CONVERSION_PRESETS.length + COMPRESS_PRESETS.length - skipped - skippedByPolicy,
    skippedByPolicy,
  };
}
