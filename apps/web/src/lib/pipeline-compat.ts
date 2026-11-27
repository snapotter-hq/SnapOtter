import { type Modality, pipelineStepMismatch, TOOLS, toolInputModality } from "@snapotter/shared";

export interface StepWarning {
  expects: Modality;
  receives: Modality;
}

/** For each step, a warning if it can't read its source (previous step's output, or the
 * uploaded file for step 0). Later steps use the server's own rule, pipelineStepMismatch.
 * null = compatible / unknown. */
export function computeStepWarnings(
  toolIds: string[],
  uploadedModality: Modality | null,
): (StepWarning | null)[] {
  return toolIds.map((id, i) => {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return null;
    if (i === 0) {
      const expects = toolInputModality(tool);
      return uploadedModality && uploadedModality !== expects
        ? { expects, receives: uploadedModality }
        : null;
    }
    const prev = TOOLS.find((t) => t.id === toolIds[i - 1]);
    return prev ? pipelineStepMismatch(prev, tool) : null;
  });
}
