import { getRequiredBundlesForTool } from "@snapotter/shared";

interface InstalledAiCapabilityGate {
  installed: boolean;
  runInstalledContract: boolean;
  runUnavailableContract: boolean;
}

type ToolCapabilityDetector = (toolId: string) => boolean;

/** Select complementary integration lanes without hiding required-feature failures. */
export function installedAiCapabilityGate(
  toolId: string,
  requireAiFeatures: boolean,
  isInstalled: ToolCapabilityDetector,
): InstalledAiCapabilityGate {
  if (getRequiredBundlesForTool(toolId).length === 0) {
    throw new Error(`${toolId}: installed AI gate requires a bundle-gated tool`);
  }

  const installed = isInstalled(toolId);
  return {
    installed,
    runInstalledContract: installed || requireAiFeatures,
    runUnavailableContract: !installed,
  };
}
