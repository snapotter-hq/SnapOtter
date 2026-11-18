// @vitest-environment node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFJS_LEGACY_ALIASES, pdfjsAssets } from "../../../apps/web/vite.pdfjs-assets";

/**
 * #4667 (Sentry WEB-2Q): pdf.js's modern build throws "Iterator is not
 * defined" at module top level on Safari < 18.4 and Chrome < 122. The web and
 * demo builds must resolve every pdf.js specifier the source uses to the
 * legacy build, which carries the polyfills.
 */
const ROOT = path.resolve(__dirname, "../../..");
const WEB_NODE_MODULES = path.join(ROOT, "apps/web/node_modules");
const SOURCE_DIRS = [path.join(ROOT, "apps/web/src"), path.join(ROOT, "apps/demo/src")];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

function pdfjsSpecifiers(): Set<string> {
  const found = new Set<string>();
  for (const file of SOURCE_DIRS.flatMap(sourceFiles)) {
    for (const m of readFileSync(file, "utf8").matchAll(/["'](pdfjs-dist[^"'?]*)/g)) {
      found.add(m[1]);
    }
  }
  return found;
}

function resolveAlias(specifier: string): string | null {
  for (const { find, replacement } of PDFJS_LEGACY_ALIASES) {
    if (find.test(specifier)) return specifier.replace(find, replacement);
  }
  return null;
}

describe("pdf.js resolves to its legacy build (#4667)", () => {
  it("is applied by the shared Vite plugin", () => {
    const plugin = pdfjsAssets();
    const config = (plugin.config as () => { resolve: { alias: unknown } })();
    expect(config.resolve.alias).toBe(PDFJS_LEGACY_ALIASES);
  });

  it("covers every pdf.js specifier the app imports, and each target exists", () => {
    const specifiers = pdfjsSpecifiers();
    expect(specifiers).toContain("pdfjs-dist");
    expect(specifiers).toContain("pdfjs-dist/build/pdf.worker.min.mjs");
    for (const specifier of specifiers) {
      const target = resolveAlias(specifier);
      expect(target, `${specifier} is not aliased to the legacy build`).toMatch(
        /^pdfjs-dist\/legacy\/build\//,
      );
      expect(existsSync(path.join(WEB_NODE_MODULES, target as string))).toBe(true);
    }
  });

  it("leaves pdf.js's other entry points alone", () => {
    expect(resolveAlias("pdfjs-dist/legacy/build/pdf.mjs")).toBeNull();
    expect(resolveAlias("pdfjs-dist/types/src/display/api")).toBeNull();
  });
});
