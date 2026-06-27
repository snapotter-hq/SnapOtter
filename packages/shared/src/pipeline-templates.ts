import { getRequiredBundlesForTool } from "./features.js";
import type { Modality } from "./modality.js";

export interface PipelineTemplateStep {
  toolId: string;
  settings: Record<string, unknown>;
}

export interface PipelineTemplate {
  /** Stable id; also the key into the `pipelineTemplates` i18n namespace. */
  id: string;
  /** Primary modality, used for grouping in the Automate UI. */
  modality: Modality;
  steps: PipelineTemplateStep[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "web-optimize",
    modality: "image",
    steps: [
      { toolId: "resize", settings: { width: 1920, fit: "inside", withoutEnlargement: true } },
      { toolId: "convert", settings: { format: "webp", quality: 80 } },
    ],
  },
  {
    id: "email-friendly",
    modality: "image",
    steps: [
      { toolId: "resize", settings: { width: 1024, fit: "inside", withoutEnlargement: true } },
      { toolId: "compress", settings: { mode: "quality", quality: 70 } },
    ],
  },
  {
    id: "privacy-scrub",
    modality: "image",
    steps: [
      { toolId: "strip-metadata", settings: { stripAll: true } },
      { toolId: "compress", settings: { mode: "quality", quality: 85 } },
    ],
  },
  {
    id: "social-square",
    modality: "image",
    steps: [
      { toolId: "resize", settings: { width: 1080, height: 1080, fit: "cover" } },
      { toolId: "compress", settings: { mode: "quality", quality: 80 } },
    ],
  },
  {
    id: "watermark-batch",
    modality: "image",
    steps: [
      {
        toolId: "watermark-text",
        settings: { text: "Your watermark", position: "bottom-right", opacity: 50 },
      },
      { toolId: "compress", settings: { mode: "quality", quality: 80 } },
    ],
  },
  {
    id: "shrink-pdf-email",
    modality: "document",
    steps: [
      { toolId: "flatten-pdf", settings: {} },
      { toolId: "compress-pdf", settings: { mode: "quality", quality: 50 } },
    ],
  },
  {
    id: "podcast-polish",
    modality: "audio",
    steps: [
      { toolId: "silence-removal", settings: { thresholdDb: -50, minSilenceS: 0.5 } },
      { toolId: "normalize-audio", settings: {} },
      { toolId: "fade-audio", settings: { fadeInS: 2, fadeOutS: 2 } },
    ],
  },
  {
    id: "cut-out-subject",
    modality: "image",
    steps: [
      {
        toolId: "remove-background",
        settings: {
          backgroundType: "transparent",
          outputFormat: "webp",
          edgeRefine: 1,
          decontaminate: true,
        },
      },
      { toolId: "compress", settings: { mode: "quality", quality: 90 } },
    ],
  },
  {
    id: "restore-old-photo",
    modality: "image",
    steps: [
      {
        toolId: "restore-photo",
        settings: {
          scratchRemoval: true,
          faceEnhancement: true,
          fidelity: 0.7,
          denoise: true,
          denoiseStrength: 25,
          colorize: false,
          colorizeStrength: 85,
        },
      },
      { toolId: "colorize", settings: { intensity: 1, model: "auto" } },
      { toolId: "upscale", settings: { scale: 2 } },
    ],
  },
];

/** Union of model bundles required by a template's steps (empty for OOTB templates). */
export function templateRequiredBundles(template: PipelineTemplate): string[] {
  const bundles = new Set<string>();
  for (const step of template.steps) {
    for (const bundleId of getRequiredBundlesForTool(step.toolId)) {
      bundles.add(bundleId);
    }
  }
  return [...bundles];
}
