import { appUrl } from "@/lib/app-url";

// Options every pdfjs.getDocument() call must pass. Without them pdf.js
// silently drops text set in CID-keyed fonts (CJK and much non-Latin text) and
// in non-embedded standard-14 fonts (#1084), and renders scanned B&W pages
// (CCITT fax, JBIG2) and JPEG 2000 images blank, because their decoders load
// from wasmUrl (#2082). The files are copied into the build by
// vite.pdfjs-assets.ts. The URLs are root-relative plus the
// deployment path: the demo has no <base>, so resolving against the page URL
// would point /pdf/organize-pdf at /pdf/pdfjs/.
//
// useWasm is off because the API's CSP has no 'wasm-unsafe-eval': a browser
// refuses to compile the wasm decoders, and ICC colour management has no JS
// fallback at all, so trying wasm only buys a blocked compile and a console
// warning per document. pdf.js loads the *_nowasm_fallback.js modules from
// wasmUrl instead, which script-src 'self' allows. Dev and the demo have no
// CSP; they take the same path so every deployment renders alike.
const assetUrl = (dir: string) => new URL(appUrl(`/pdfjs/${dir}/`), document.baseURI).href;

export function pdfDocumentOptions() {
  return {
    cMapUrl: assetUrl("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetUrl("standard_fonts"),
    wasmUrl: assetUrl("wasm"),
    useWasm: false,
  };
}
