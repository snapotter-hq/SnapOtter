import { appUrl } from "@/lib/app-url";

// Options every pdfjs.getDocument() call must pass. Without them pdf.js
// silently drops text set in CID-keyed fonts (CJK and much non-Latin text) and
// in non-embedded standard-14 fonts (#1084). The files are copied into the
// build by vite.pdfjs-assets.ts. The URLs are root-relative plus the
// deployment path: the demo has no <base>, so resolving against the page URL
// would point /pdf/organize-pdf at /pdf/pdfjs/.
const assetUrl = (dir: string) => new URL(appUrl(`/pdfjs/${dir}/`), document.baseURI).href;

export function pdfDocumentOptions() {
  return {
    cMapUrl: assetUrl("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetUrl("standard_fonts"),
  };
}
