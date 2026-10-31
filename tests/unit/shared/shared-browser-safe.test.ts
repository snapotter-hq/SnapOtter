import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// packages/shared is imported by the web app as well as the API. A production
// build stubs Node built-ins out and tree-shakes unused code, so a stray
// `import ... from "node:fs"` there ships fine and every build-based test
// passes. The Vite dev server doesn't: it maps the built-in to an empty stub,
// the named import fails to link, and the app renders nothing. That's how
// #1332 blanked `pnpm dev` and the analytics nightly (#1394). Server-only code
// in this package reaches for built-ins at call time (process.getBuiltinModule)
// instead of at module load.
const SHARED_SRC = join(__dirname, "../../../packages/shared/src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

describe("packages/shared stays loadable in the browser (#1394)", () => {
  it("has no static import of a Node built-in", () => {
    const offenders: string[] = [];
    const files = sourceFiles(SHARED_SRC);
    // A scan that finds nothing would pass without checking anything.
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const specifiers = [
        ...text.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm),
        ...text.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
        // A module-scope `await import("node:fs")` breaks the dev server the
        // same way; one inside a function is harmless but just as easy to avoid.
        // `typeof import("node:fs")` is a type and is erased, so it's allowed.
        ...text.matchAll(/(?<!typeof\s)\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ].map((m) => m[1]);
      for (const spec of specifiers) {
        const bare = spec.replace(/^node:/, "").split("/")[0];
        if (spec.startsWith("node:") || BUILTINS.has(bare)) {
          offenders.push(`${relative(SHARED_SRC, file)}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
