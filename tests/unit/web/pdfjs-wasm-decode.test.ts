// @vitest-environment node

import { describe, expect, it } from "vitest";
import { decodeFirstImage, PDFJS_WASM_DIR } from "./ccitt-pdf-fixture";

// pdf.js 6 decodes CCITT fax, JBIG2 and JPEG 2000 images through decoder
// modules loaded from wasmUrl (#2082). The failing call has to come first: the
// decode helper cleans the document up, which resets pdf.js's cached decoder.
describe("pdf.js image decoding needs wasmUrl (#2082)", () => {
  it("leaves a CCITT Group 4 image undecoded without wasmUrl and decodes it with the shipped directory", async () => {
    // @ts-expect-error legacy build ships no types; the main build needs a DOM worker
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    expect(await decodeFirstImage(pdfjs, {})).toBeNull();
    expect(await decodeFirstImage(pdfjs, { wasmUrl: PDFJS_WASM_DIR })).toEqual({
      width: 64,
      height: 64,
    });
  });
});
