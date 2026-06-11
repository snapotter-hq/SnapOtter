import { MODALITY_POOL, TOOL_BUNDLE_MAP, TOOLS } from "@snapotter/shared";
import { hasAiJobHandler } from "../jobs/ai-handlers.js";
import type { Pool } from "../jobs/types.js";

/** ai handler/bundle wins; else the tool's modality decides (spec 4.5). */
export function resolveToolPool(toolId: string): Pool {
  if (hasAiJobHandler(toolId) || TOOL_BUNDLE_MAP[toolId]) return "ai";
  const tool = TOOLS.find((t) => t.id === toolId);
  return tool ? MODALITY_POOL[tool.modality] : "image";
}

export function shouldSkipSyncWindow(executionHint: "fast" | "long" | undefined): boolean {
  return executionHint === "long";
}
