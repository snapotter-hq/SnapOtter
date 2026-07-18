export interface FeatureBundleInfo {
  id: string;
  name: string;
  description: string;
  estimatedSize: string;
  enablesTools: string[];
}

export type FeatureStatus = "not_installed" | "queued" | "installing" | "installed" | "error";

export type FeatureCompatibility = "compatible" | "incompatible" | "invalid";

export type OcrQualityTier = "fast" | "balanced" | "best";

export interface FeatureBundleState {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  installedVersion: string | null;
  estimatedSize: string;
  // Real download / on-disk sizes for THIS host's architecture, read from the
  // bundle manifest. Legacy amd64 bundles are CUDA-inclusive whether or not a
  // GPU is present; portable v3 runtimes such as OCR report their selected CPU
  // target instead. Optional/nullable: absent in native (non-Docker) mode and
  // when the manifest lacks the value (extractedSize is 0 for some archives).
  downloadBytes?: number | null;
  installedBytes?: number | null;
  /** Host/runtime compatibility metadata for optional portable runtimes. */
  compatibility?: FeatureCompatibility;
  compatibilityReason?: string | null;
  selectedTarget?: string | null;
  missingDownloadBytes?: number | null;
  healthyGeneration?: string | null;
  availableQualities?: OcrQualityTier[];
  requiredMemoryBytes?: number | null;
  effectiveMemoryBytes?: number | null;
  enablesTools: string[];
  progress: { percent: number; stage: string } | null;
  error: string | null;
}

export const FEATURE_BUNDLES: Record<string, FeatureBundleInfo> = {
  "background-removal": {
    id: "background-removal",
    name: "Background Removal",
    description: "Remove image backgrounds with AI",
    estimatedSize: "4-5 GB",
    enablesTools: [
      "remove-background",
      "remove-gif-background",
      "passport-photo",
      "transparency-fixer",
      "background-replace",
      "blur-background",
    ],
  },
  "face-detection": {
    id: "face-detection",
    name: "Face Detection",
    description: "Detect and blur faces, fix red-eye, smart crop",
    estimatedSize: "200-300 MB",
    enablesTools: ["blur-faces", "red-eye-removal", "smart-crop"],
  },
  "object-eraser-colorize": {
    id: "object-eraser-colorize",
    name: "Object Eraser & Colorize",
    description: "Erase objects from photos and colorize B&W images",
    estimatedSize: "1-2 GB",
    enablesTools: ["erase-object", "colorize", "ai-canvas-expand"],
  },
  "inpaint-hq": {
    id: "inpaint-hq",
    name: "High-Quality Inpainting",
    description:
      "Diffusion-based object removal for large objects, detailed textures, and structured backgrounds",
    estimatedSize: "5-7 GB",
    enablesTools: ["erase-object"],
  },
  "upscale-enhance": {
    id: "upscale-enhance",
    name: "Upscale & Enhance",
    description: "AI upscaling, face enhancement, and noise removal",
    estimatedSize: "5-6 GB",
    enablesTools: ["upscale", "enhance-faces", "noise-removal"],
  },
  "photo-restoration": {
    id: "photo-restoration",
    name: "Photo Restoration",
    description: "Restore old or damaged photos",
    estimatedSize: "4-5 GB",
    enablesTools: ["restore-photo"],
  },
  ocr: {
    id: "ocr",
    name: "OCR",
    description: "Extract text from images and PDFs",
    estimatedSize: "~208-234 MiB download / ~409-488 MiB installed",
    enablesTools: ["ocr", "ocr-pdf"],
  },
  transcription: {
    id: "transcription",
    name: "Transcription",
    description: "Speech to text for audio and video (subtitles)",
    estimatedSize: "~600 MB",
    enablesTools: ["transcribe-audio", "auto-subtitles"],
  },
};

/**
 * Optional feature packs that improve a tool without controlling whether the
 * tool itself is available. OCR's Fast tier is built into the image, while its
 * Balanced and Best tiers are provided by the separately installed OCR pack.
 */
export const TOOL_OPTIONAL_BUNDLE_MAP: Readonly<Record<string, string>> = {
  ocr: "ocr",
  "ocr-pdf": "ocr",
  // High-Quality (diffusion) inpainting upgrades Object Eraser without gating
  // it: the base LaMa model in `object-eraser-colorize` stays the tool's
  // required primary. `getRequiredBundlesForTool("erase-object")` is unchanged;
  // HQ availability is a separate, explicit `inpaint-hq` install check.
  "erase-object": "inpaint-hq",
};

export const TOOL_BUNDLE_MAP: Record<string, string> = {};
for (const [bundleId, bundle] of Object.entries(FEATURE_BUNDLES)) {
  for (const toolId of bundle.enablesTools) {
    // An optional pack must never claim a tool's required-primary slot, but a
    // different, non-optional bundle still can. Skip only when THIS bundle is
    // the tool's optional pack; the first non-optional bundle to list the tool
    // wins. This is behavior-identical for every tool that has no optional pack.
    if (TOOL_OPTIONAL_BUNDLE_MAP[toolId] === bundleId) continue;
    if (!TOOL_BUNDLE_MAP[toolId]) TOOL_BUNDLE_MAP[toolId] = bundleId;
  }
}

export function getBundleForTool(toolId: string): FeatureBundleInfo | null {
  const bundleId = TOOL_BUNDLE_MAP[toolId];
  return bundleId ? FEATURE_BUNDLES[bundleId] : null;
}

export function getOptionalBundleForTool(toolId: string): FeatureBundleInfo | null {
  const bundleId = TOOL_OPTIONAL_BUNDLE_MAP[toolId];
  return bundleId ? FEATURE_BUNDLES[bundleId] : null;
}

export function getToolsForBundle(bundleId: string): string[] {
  return FEATURE_BUNDLES[bundleId]?.enablesTools ?? [];
}

/**
 * Tools that need AI models from MORE THAN ONE feature bundle.
 *
 * The "primary" bundle (the one whose `enablesTools` lists the tool) is in
 * TOOL_BUNDLE_MAP. Any ADDITIONAL bundles the tool's processing requires are
 * listed here. Example: Passport Photo removes the background (its primary
 * `background-removal` bundle) but first runs face-landmark detection, which
 * is gated to the separate `face-detection` bundle.
 */
export const TOOL_EXTRA_BUNDLES: Record<string, string[]> = {
  "passport-photo": ["face-detection"],
  // enhance-faces runs MediaPipe face detection (blaze_face) before CodeFormer/
  // GFPGAN; that model ships in face-detection, not its primary upscale-enhance
  // bundle, so require both or it fails on a standalone install (offline: hard
  // error; online: a surprise download).
  "enhance-faces": ["face-detection"],
};

/**
 * Every feature bundle a tool needs installed before it can run: its primary
 * bundle plus any extras from TOOL_EXTRA_BUNDLES. Order is [primary, ...extras],
 * deduped. Returns [] for tools that need no AI bundle.
 */
export function getRequiredBundlesForTool(toolId: string): string[] {
  const primary = TOOL_BUNDLE_MAP[toolId];
  if (!primary) return [];
  const extras = TOOL_EXTRA_BUNDLES[toolId] ?? [];
  return [...new Set([primary, ...extras])];
}
