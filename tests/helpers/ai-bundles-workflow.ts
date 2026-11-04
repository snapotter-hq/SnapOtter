import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every script under scripts/ai-bundles/ is a step body moved verbatim out of
 * ai-bundles.yml (#4452). The header restores the `bash -e` GitHub gives an
 * inline `run:` block, because the step now execs the file through its shebang.
 */
export const AI_BUNDLES_SCRIPT_HEADER = "#!/usr/bin/env bash\nset -e\n";

export const AI_BUNDLES_WORKFLOW = ".github/workflows/ai-bundles.yml";

const SCRIPT_RUN = /^( *)run: (scripts\/ai-bundles\/[A-Za-z0-9._-]+)$/;

/** The script's body exactly as it ran when it was an inline `run: |` block. */
export function aiBundlesScriptBody(root: string, relativePath: string): string {
  const source = readFileSync(path.resolve(root, relativePath), "utf8");
  if (!source.startsWith(AI_BUNDLES_SCRIPT_HEADER)) {
    throw new Error(`${relativePath} must start with the shared bash -e header`);
  }
  return source.slice(AI_BUNDLES_SCRIPT_HEADER.length);
}

/**
 * Returns ai-bundles.yml with each `run: scripts/ai-bundles/<file>` step put
 * back as the inline block it replaced, so the workflow contract tests keep
 * asserting the exact shell and Python that runs, in workflow order and with
 * the workflow's indentation.
 */
export function expandAiBundlesScripts(workflow: string, root: string): string {
  return workflow
    .split("\n")
    .flatMap((line) => {
      const match = SCRIPT_RUN.exec(line);
      if (!match) return [line];
      const [, indent, script] = match;
      const body = aiBundlesScriptBody(root, script).replace(/\n+$/, "").split("\n");
      return [
        `${indent}run: |`,
        ...body.map((bodyLine) => (bodyLine ? `${indent}  ${bodyLine}` : "")),
      ];
    })
    .join("\n");
}

export function readExpandedAiBundlesWorkflow(root: string): string {
  return expandAiBundlesScripts(
    readFileSync(path.resolve(root, AI_BUNDLES_WORKFLOW), "utf8"),
    root,
  );
}
