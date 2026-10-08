// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { decodeFirstImage, PDFJS_WASM_DIR } from "./ccitt-pdf-fixture";

// The API's CSP has no 'wasm-unsafe-eval', so a browser refuses to compile the
// wasm decoders (#2082). pdfDocumentOptions() sets useWasm: false, which sends
// pdf.js straight to the *_nowasm_fallback.js modules in wasmUrl, and
// script-src 'self' allows those. Same options here: the image must decode
// without WebAssembly.instantiate being called. If pdf.js stops honouring
// useWasm, the spy still fires on a refused compile and fails the test.
describe("pdf.js decodes through the JS fallback with useWasm off (#2082)", () => {
  it("decodes a CCITT Group 4 image without compiling wasm", async () => {
    const original = WebAssembly.instantiate;
    const instantiate = vi.fn(async () => {
      throw new WebAssembly.CompileError("Refused to compile: Content Security Policy");
    });
    WebAssembly.instantiate = instantiate as unknown as typeof WebAssembly.instantiate;
    try {
      // @ts-expect-error legacy build ships no types; the main build needs a DOM worker
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

      expect(await decodeFirstImage(pdfjs, { wasmUrl: PDFJS_WASM_DIR, useWasm: false })).toEqual({
        width: 64,
        height: 64,
      });
      expect(instantiate).not.toHaveBeenCalled();
    } finally {
      WebAssembly.instantiate = original;
    }
  });
});
