// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeFirstImage } from "./ccitt-pdf-fixture";

// The API's CSP has no 'wasm-unsafe-eval', so a browser refuses to compile the
// wasm decoders (#2082). pdf.js then imports the *_nowasm_fallback.js module
// from the same wasmUrl, which script-src 'self' allows. WebAssembly.instantiate
// is made to reject the way the CSP does, and the image must still decode.
describe("pdf.js wasm fallback under a CSP that refuses wasm (#2082)", () => {
  it("decodes a CCITT Group 4 image through the JS fallback", async () => {
    const instantiate = WebAssembly.instantiate;
    WebAssembly.instantiate = (async () => {
      throw new WebAssembly.CompileError("Refused to compile: Content Security Policy");
    }) as typeof WebAssembly.instantiate;
    try {
      // @ts-expect-error legacy build ships no types; the main build needs a DOM worker
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const wasmDir = path.resolve(__dirname, "../../../apps/web/node_modules/pdfjs-dist/wasm/");

      expect(await decodeFirstImage(pdfjs, { wasmUrl: `${wasmDir}/` })).toEqual({
        width: 64,
        height: 64,
      });
    } finally {
      WebAssembly.instantiate = instantiate;
    }
  });
});
