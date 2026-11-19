const SECTION_HEADINGS = ".vp-doc h2[id], .vp-doc h3[id], .vp-doc h4[id]";

/**
 * The section anchor a click on heading text should follow, or null when the
 * click should be left alone: outside a doc heading, on a real link, or while
 * the reader is selecting text.
 */
export function headingAnchorFor(
  target: EventTarget | null,
  selectedText: string,
): HTMLAnchorElement | null {
  if (selectedText || !(target instanceof Element) || target.closest("a")) return null;
  const heading = target.closest(SECTION_HEADINGS);
  return heading?.querySelector<HTMLAnchorElement>("a.header-anchor") ?? null;
}

// Readers click heading text expecting a section link, but only the hover-only
// "#" beside it is one (#5008). Following that same anchor keeps VitePress's
// own router in charge of the hash change and the scroll.
export function installHeadingLinks(doc: Document): void {
  doc.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    headingAnchorFor(event.target, doc.getSelection()?.toString() ?? "")?.click();
  });
}
