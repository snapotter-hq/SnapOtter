// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeFirstImage } from "./ccitt-pdf-fixture";

// pdf.js 6 decodes CCITT fax, JBIG2 and JPEG 2000 images through wasm modules
// loaded from wasmUrl (#2082). This runs alone in its file because pdf.js
// caches a failed decoder init for the life of the process.
describe("pdf.js wasm image decoding (#2082)", () => {
  it("decodes a CCITT Group 4 image when wasmUrl points at the shipped wasm directory", async () => {
    // @ts-expect-error legacy build ships no types; the main build needs a DOM worker
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const wasmDir = path.resolve(__dirname, "../../../apps/web/node_modules/pdfjs-dist/wasm/");

    expect(await decodeFirstImage(pdfjs, { wasmUrl: `${wasmDir}/` })).toEqual({
      width: 64,
      height: 64,
    });
  });
});
