import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Background-removal model names live in TypeScript (the web quality map, the
 * GIF settings, passport-photo, transparency-fixer, the bridge's OOM fallback)
 * and in packages/ai/python/remove_bg.py's ALLOWED_MODELS. The script quietly
 * swaps any name outside that set for birefnet-general-lite, so a rename on
 * one side downgrades quality with no error (#1300).
 *
 * Every model name the TypeScript sources send must be in ALLOWED_MODELS.
 * The sources are scanned rather than imported so a new call site is covered
 * without anyone remembering to add it here.
 */

const root = path.resolve(import.meta.dirname, "../../..");
const SOURCE_DIRS = ["apps/api/src", "apps/web/src", "packages/ai/src", "packages/shared/src"];
// rembg's session names, plus the BiRefNet sessions remove_bg.py registers.
const MODEL_NAME =
  /["'`](u2net(?:p|_human_seg|_cloth_seg)?|isnet-[a-z]+(?:-[a-z]+)*|silueta|bria-rmbg|birefnet-[a-z]+(?:-[a-z]+)*)["'`]/g;

function allowedModels(): Set<string> {
  const source = readFileSync(path.join(root, "packages/ai/python/remove_bg.py"), "utf8");
  const literal = source.match(/^ALLOWED_MODELS = \{([^}]*)\}/m)?.[1];
  if (!literal) throw new Error("ALLOWED_MODELS set literal not found in remove_bg.py");
  return new Set([...literal.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Locale catalogues name models in prose, not as values sent anywhere.
      if (entry === "node_modules" || entry === "i18n") continue;
      files.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

const referenced = SOURCE_DIRS.flatMap((dir) =>
  sourceFiles(path.join(root, dir)).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(MODEL_NAME)].map((m) => ({
      file: path.relative(root, file),
      name: m[1],
    })),
  ),
);

describe("background-removal model names", () => {
  it("finds the model names the TypeScript side sends", () => {
    // Guards against the scan silently matching nothing.
    const names = new Set(referenced.map((r) => r.name));
    for (const known of ["birefnet-hr-matting", "birefnet-general", "birefnet-portrait", "u2net"]) {
      expect(names, `expected the scan to find ${known}`).toContain(known);
    }
  });

  it("are all in remove_bg.py's ALLOWED_MODELS", () => {
    const allowed = allowedModels();
    const unknown = referenced.filter((r) => !allowed.has(r.name));
    expect(unknown, "remove_bg.py would silently swap these for birefnet-general-lite").toEqual([]);
  });
});
