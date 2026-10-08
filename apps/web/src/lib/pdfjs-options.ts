// Options every pdfjs.getDocument() call must pass. Without them pdf.js
// silently drops text set in CID-keyed fonts (CJK and much non-Latin text) and
// in non-embedded standard-14 fonts (#1084). The files are copied into the
// build by vite.pdfjs-assets.ts. The URLs are absolute because pdf.js fetches
// them from its worker, which would resolve a relative URL against the worker
// script instead of the page's <base>.
const assetUrl = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href;

export function pdfDocumentOptions() {
  return {
    cMapUrl: assetUrl("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetUrl("standard_fonts"),
  };
}
