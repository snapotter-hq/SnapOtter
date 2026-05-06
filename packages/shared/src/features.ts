export interface FeatureBundleInfo {
  id: string;
  name: string;
  description: string;
  estimatedSize: string;
  enablesTools: string[];
}

export type FeatureStatus = "not_installed" | "installing" | "installed" | "error";

export interface FeatureBundleState {
  id: string;
  name: string;
  description: string;
  status: FeatureStatus;
  installedVersion: string | null;
  estimatedSize: string;
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
    enablesTools: ["remove-background", "passport-photo", "transparency-fixer"],
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
    enablesTools: ["erase-object", "colorize"],
  },
  "upscale-enhance": {
    id: "upscale-enhance",
    name: "Upscale & Enhance",
    description: "AI upscaling, face enhancement, and noise removal",
    estimatedSize: "4-5 GB",
    enablesTools: ["upscale", "enhance-faces", "noise-removal"],
  },
  "photo-restoration": {
    id: "photo-restoration",
    name: "Photo Restoration",
    description: "Restore old or damaged photos",
    estimatedSize: "800 MB - 1 GB",
    enablesTools: ["restore-photo"],
  },
  ocr: {
    id: "ocr",
    name: "OCR",
    description: "Extract text from images",
    estimatedSize: "3-4 GB",
    enablesTools: ["ocr"],
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
