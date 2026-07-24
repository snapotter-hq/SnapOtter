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
