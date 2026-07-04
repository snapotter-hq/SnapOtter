export interface FeatureBundleInfo {
  id: string;
  name: string;
  description: string;
  estimatedSize: string;
  enablesTools: string[];
}

export type FeatureStatus = "not_installed" | "queued" | "installing" | "installed" | "error";

export interface FeatureBundleState {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  installedVersion: string | null;
  estimatedSize: string;
  // Real download / on-disk sizes for THIS host's architecture, read from the
  // bundle manifest. amd64 hosts pull the CUDA-inclusive archive whether or not
  // a GPU is present, so these can be much larger than the coarse estimatedSize
  // label suggests. Optional/nullable: absent in native (non-Docker) mode and
  // when the manifest lacks the value (extractedSize is 0 for some archives).
  downloadBytes?: number | null;
  installedBytes?: number | null;
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
    description: "Extract text from images",
    estimatedSize: "5-6 GB",
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

export const TOOL_BUNDLE_MAP: Record<string, string> = {};
for (const [bundleId, bundle] of Object.entries(FEATURE_BUNDLES)) {
  for (const toolId of bundle.enablesTools) {
    TOOL_BUNDLE_MAP[toolId] = bundleId;
  }
}

export function getBundleForTool(toolId: string): FeatureBundleInfo | null {
  const bundleId = TOOL_BUNDLE_MAP[toolId];
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
