// Build-time per-section tool counts for the docs homepage chips. Derived from
// the shared TOOLS catalog via toolSection() so the numbers never drift (the
// project's single-source-of-truth rule for per-section counts). Runs in Node
// during the VitePress build; only the resulting numbers reach the client.
import { defineLoader } from "vitepress";
import { TOOLS } from "../../../../packages/shared/src/constants.ts";
import { type Section, toolSection } from "../../../../packages/shared/src/section.ts";

export type SectionCounts = Record<Section, number>;

declare const data: SectionCounts;

export { data };

export default defineLoader({
  load(): SectionCounts {
    const counts: SectionCounts = { image: 0, video: 0, audio: 0, pdf: 0, files: 0 };
    for (const tool of TOOLS) counts[toolSection(tool)]++;
    return counts;
  },
});
