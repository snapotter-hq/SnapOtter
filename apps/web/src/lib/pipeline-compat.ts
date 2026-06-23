import { type Modality, TOOLS, toolInputModality, toolOutputModality } from "@snapotter/shared";

export interface StepWarning {
  expects: Modality;
  receives: Modality;
}

/** For each step, a warning if its expected input modality does not match its source
 * (previous step's output, or the uploaded file for step 0). null = compatible / unknown. */
export function computeStepWarnings(
  toolIds: string[],
  uploadedModality: Modality | null,
): (StepWarning | null)[] {
  return toolIds.map((id, i) => {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return null;
    const expects = toolInputModality(tool);
    let receives: Modality | null;
    if (i === 0) {
      receives = uploadedModality;
    } else {
      const prev = TOOLS.find((t) => t.id === toolIds[i - 1]);
      receives = prev ? toolOutputModality(prev) : null;
    }
    return receives && receives !== expects ? { expects, receives } : null;
  });
}
