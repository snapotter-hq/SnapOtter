import { MODALITY_POOL, type Section, TOOL_BUNDLE_MAP, TOOLS } from "@snapotter/shared";
import { hasAiJobHandler } from "../jobs/ai-handlers.js";
import type { Pool } from "../jobs/types.js";

/** Backwards-compatible route aliases consolidated into canonical catalog tools. */
const LEGACY_TOOL_ALIASES: Readonly<Record<string, string>> = {
  "brightness-contrast": "adjust-colors",
  saturation: "adjust-colors",
  "color-channels": "adjust-colors",
  "color-effects": "adjust-colors",
};

const SECTION_POOL: Readonly<Record<Section, Pool>> = {
  image: "image",
  video: "media",
  audio: "media",
  pdf: "docs",
  files: "docs",
};

/** ai handler/bundle wins; else the tool's modality decides (spec 4.5). */
export function resolveToolPool(toolId: string, section?: Section): Pool {
  const canonicalId = LEGACY_TOOL_ALIASES[toolId] ?? toolId;
  if (hasAiJobHandler(canonicalId) || TOOL_BUNDLE_MAP[canonicalId]) return "ai";
  const tool = TOOLS.find((t) => t.id === canonicalId);
  if (tool) return MODALITY_POOL[tool.modality];
  // Non-catalog routes with an explicit section map to that section's pool;
  // unknown tools fall back to the general-purpose "system" pool rather than
  // assuming the image pool (a legacy image-only default).
  return section ? SECTION_POOL[section] : "system";
}

export function shouldSkipSyncWindow(executionHint: "fast" | "long" | undefined): boolean {
  return executionHint === "long";
}
