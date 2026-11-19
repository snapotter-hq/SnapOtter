import type { FeatureBundleState, Tool } from "@snapotter/shared";
import { getRequiredBundlesForTool, getToolsForBundle, TOOLS } from "@snapotter/shared";
import { useEffect, useRef, useState } from "react";

/**
 * The tools a bundle unlocks that can run right now. A tool can need more than
 * one bundle (passport-photo also needs face-detection), so each one is checked
 * against every bundle it requires, not just the one that was installed.
 */
export function readyToolsForBundle(bundleId: string, bundles: FeatureBundleState[]): Tool[] {
  // An incompatible bundle can sit installed from before its gate (#4680), but
  // its tools would only fail, so it never counts as ready.
  const installed = new Set(
    bundles
      .filter((b) => b.status === "installed" && b.compatibility !== "incompatible")
      .map((b) => b.id),
  );
  if (!installed.has(bundleId)) return [];
  return getToolsForBundle(bundleId).flatMap((toolId) => {
    if (!getRequiredBundlesForTool(toolId).every((id) => installed.has(id))) return [];
    const tool = TOOLS.find((t) => t.id === toolId);
    return tool ? [tool] : [];
  });
}

/**
 * True from the moment a tool page's install prompt gives way to the installed
 * tool until the user adds a file. A tool that was already installed when the
 * page opened never turns it on.
 */
export function useJustInstalled(
  toolId: string | undefined,
  promptShown: boolean,
  ready: boolean,
  hasFiles: boolean,
): boolean {
  const promptedFor = useRef<string | undefined>(undefined);
  const [readyFor, setReadyFor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (promptShown) {
      promptedFor.current = toolId;
      return;
    }
    if (ready && toolId && promptedFor.current === toolId) {
      promptedFor.current = undefined;
      setReadyFor(toolId);
    }
  }, [toolId, promptShown, ready]);

  useEffect(() => {
    if (hasFiles) setReadyFor(undefined);
  }, [hasFiles]);

  return readyFor !== undefined && readyFor === toolId;
}
