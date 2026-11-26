import { PYTHON_SIDECAR_TOOLS, TOOLS } from "../../packages/shared/src/constants.js";

// Kept free of IO so the drift test can rebuild the array in memory and compare it
// with the committed tools-meta.json without rewriting that file.
export function buildToolsMeta() {
  const ai = new Set<string>(PYTHON_SIDECAR_TOOLS as readonly string[]);

  return TOOLS.map((t) => ({
    id: t.id,
    name: t.name,
    modality: t.modality,
    route: t.route,
    acceptedInputs: t.acceptedInputs,
    executionHint: t.executionHint,
    isAI: ai.has(t.id),
  }));
}
