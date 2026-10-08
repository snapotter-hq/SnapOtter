// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { pdfDocumentOptions } from "@/lib/pdfjs-options";
import { pdfjsAssets } from "../../../apps/web/vite.pdfjs-assets";

const WEB_SRC = path.resolve(__dirname, "../../../apps/web/src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("pdf.js asset options (#1084)", () => {
  it("points CMaps and standard fonts at the app's own origin, resolved against <base>", () => {
    const base = document.createElement("base");
    base.href = "https://snap.example/sub/";
    document.head.appendChild(base);
    try {
      expect(pdfDocumentOptions()).toEqual({
        cMapUrl: "https://snap.example/sub/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "https://snap.example/sub/pdfjs/standard_fonts/",
      });
    } finally {
      base.remove();
    }
  });

  it("every getDocument() call in the web app passes the shared options", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(WEB_SRC)) {
      if (file.endsWith("pdfjs-options.ts")) continue;
      const text = readFileSync(file, "utf8");
      const calls = text.match(/\.getDocument\(/g)?.length ?? 0;
      const withOptions = text.match(/\.\.\.pdfDocumentOptions\(\)/g)?.length ?? 0;
      if (calls > withOptions) offenders.push(path.relative(WEB_SRC, file));
    }
    expect(offenders).toEqual([]);
  });

  it("a non-embedded CID font renders text only when the CMap options are given", async () => {
    // @ts-expect-error legacy build ships no types; the main build needs a DOM worker
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjsRoot = path.resolve(WEB_SRC, "../node_modules/pdfjs-dist");
    const data = readFileSync(
      path.resolve(__dirname, "../../fixtures/document/valid/cid-font-not-embedded.pdf"),
    );
    const extract = async (opts: object) => {
      const doc = await getDocument({ data: new Uint8Array(data), verbosity: 0, ...opts }).promise;
      const content = await (await doc.getPage(1)).getTextContent();
      return content.items.map((i: { str: string }) => i.str).join("");
    };

    expect(await extract({})).toBe("");
    expect(
      await extract({
        cMapUrl: `${pdfjsRoot}/cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${pdfjsRoot}/standard_fonts/`,
      }),
    ).toBe("日本語");
  });

  it("the build emits every CMap and the standard font substitutes", () => {
    const emitted: string[] = [];
    const plugin = pdfjsAssets();
    const generateBundle = plugin.generateBundle as (this: unknown) => void;
    generateBundle.call({ emitFile: (f: { fileName: string }) => emitted.push(f.fileName) });

    expect(
      emitted.filter((f) => f.startsWith("pdfjs/cmaps/") && f.endsWith(".bcmap")),
    ).not.toHaveLength(0);
    expect(emitted).toContain("pdfjs/cmaps/UniJIS-UTF16-H.bcmap");
    expect(emitted).toContain("pdfjs/standard_fonts/FoxitSerif.pfb");
    vi.restoreAllMocks();
  });
});
