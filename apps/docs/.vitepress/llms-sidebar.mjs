import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

function filterSectionLinks(items) {
  return (items ?? []).flatMap((item) => {
    if (typeof item?.link === "string" && item.link.includes("#")) return [];

    const next = { ...item };
    if (Array.isArray(next.items)) next.items = filterSectionLinks(next.items);
    return [next];
  });
}

/**
 * Keep the LLM index page-oriented. VitePress supports sidebar links to page
 * sections, but vitepress-plugin-llms resolves every link as a source file.
 */
export function pageOnlySidebar(sidebar) {
  if (Array.isArray(sidebar)) return filterSectionLinks(sidebar);
  if (!sidebar || typeof sidebar !== "object") return sidebar;

  return Object.fromEntries(
    Object.entries(sidebar).map(([base, items]) => [base, filterSectionLinks(items)]),
  );
}

function dropToolLinks(items) {
  return (items ?? []).flatMap((item) => {
    if (typeof item?.link === "string" && item.link.startsWith("/tools/")) return [];
    const next = { ...item };
    if (Array.isArray(next.items)) next.items = dropToolLinks(next.items);
    return [next];
  });
}

/**
 * The sidebar the LLM plugin builds llms.txt's table of contents from. Tool
 * pages are left out of llms.txt (see llmsIgnorePatterns), and a sidebar link
 * to an ignored page makes the plugin log a warning per link, so they go here
 * too. llms-full.txt still has the tool pages, appended after the guides.
 */
export function llmsSidebar(sidebar) {
  const pages = pageOnlySidebar(sidebar);
  if (Array.isArray(pages)) return dropToolLinks(pages);
  if (!pages || typeof pages !== "object") return pages;
  return Object.fromEntries(
    Object.entries(pages).map(([base, items]) => [base, dropToolLinks(items)]),
  );
}

/**
 * Which pages each LLM output leaves out. llms.txt is meant to be a short index,
 * so it skips the 20 translated trees (noindexed duplicates of English) and
 * the tool pages; llms-full.txt keeps the tool pages but not the translations.
 * Together the two files were 19 MB before this (#5009).
 */
export function llmsIgnorePatterns(localeCodes) {
  // The plugin matches its output path, where de/index.md has become de.md.
  const translations = localeCodes.flatMap((code) => [`${code}/**`, `${code}.md`]);
  return {
    llmsTxt: [...translations, "tools/**"],
    llmsFullTxt: translations,
  };
}

// Explicit heading ids (`## Quick Start {#quick-start}`) are VitePress syntax;
// the plugin copies them into link titles and headings verbatim.
// The plugin escapes a leading underscore, so `{#_401-x}` arrives as `{#\_401-x}`.
const HEADING_ID = /[ \t]*\{#[\w\\-]+\}(?=[ \t]*(?:\]|$))/gm;

export function stripHeadingIds(text) {
  return text.replace(HEADING_ID, "");
}

/**
 * Strip heading ids from everything vitepress-plugin-llms wrote: llms.txt,
 * llms-full.txt and the per-page .md copies. VitePress itself emits no .md, so
 * every .md under outDir is the plugin's.
 */
export async function stripHeadingIdsFromLlmsOutputs(outDir) {
  const entries = await readdir(outDir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && /\.(md|txt)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
    .filter((file) => file.endsWith(".md") || /[/\\]llms(-full)?\.txt$/.test(file));
  await Promise.all(
    files.map(async (file) => {
      const text = await readFile(file, "utf8");
      const cleaned = stripHeadingIds(text);
      if (cleaned !== text) await writeFile(file, cleaned);
    }),
  );
}
