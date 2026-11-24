import { TOOLS, toolSection } from "@snapotter/shared";

/**
 * The six jobs linked straight under the hero search, most-used first, in the
 * order #5011 set out.
 */
export const TOP_JOBS = [
  "remove-background",
  "compress-pdf",
  "convert",
  "resize",
  "merge-pdf",
  "ocr",
] as const;

/**
 * The tool's landing page path. Tool pages are English-only, so callers pass
 * this through enOnlyHref, like the search results do.
 */
export function topJobPath(id: string): string {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`top job "${id}" is not in TOOLS`);
  return `/tools/${toolSection(tool)}/${tool.id}/`;
}
