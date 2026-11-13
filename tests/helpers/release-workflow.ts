import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Matches a scripts/release/<file> reference in a workflow line. */
export const RELEASE_SCRIPT_REFERENCE = /scripts\/release\/([A-Za-z0-9._-]+)/;

export function releaseWorkflowPath(root: string): string {
  return path.resolve(root, ".github/workflows/release.yml");
}

export function releaseScriptPath(root: string, name: string): string {
  return path.resolve(root, "scripts/release", name);
}

/**
 * release.yml with every scripts/release/ file a step calls inlined directly
 * under the line that calls it, indented one level deeper.
 *
 * The large step bodies moved out of the workflow into scripts/release/
 * (#4452). The contract tests that pinned those bodies by slicing a job's
 * text read this instead, so each assertion still checks the same shell, in
 * the same job and in the same step order, wherever that shell now lives.
 */
export function readReleaseWorkflowWithScripts(root: string): string {
  const workflow = readFileSync(releaseWorkflowPath(root), "utf8");
  const expanded: string[] = [];
  for (const line of workflow.split("\n")) {
    expanded.push(line);
    if (line.trimStart().startsWith("#")) continue;
    const reference = RELEASE_SCRIPT_REFERENCE.exec(line);
    if (!reference) continue;
    const scriptPath = releaseScriptPath(root, reference[1]);
    if (!existsSync(scriptPath)) {
      throw new Error(`release.yml calls missing ${path.relative(root, scriptPath)}`);
    }
    const indent = " ".repeat(line.length - line.trimStart().length + 2);
    for (const scriptLine of readFileSync(scriptPath, "utf8").replace(/\n$/, "").split("\n")) {
      expanded.push(scriptLine === "" ? "" : `${indent}${scriptLine}`);
    }
  }
  return expanded.join("\n");
}
