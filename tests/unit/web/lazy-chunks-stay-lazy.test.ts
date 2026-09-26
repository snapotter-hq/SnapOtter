// @vitest-environment node

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * #1296: a @snapotter/shared export used only by lazily loaded web code made
 * Rolldown place that shared module in the lazy chunk, and the shared barrel
 * chunk then imported the lazy chunk back. The cycle left shared bindings
 * undefined when the first chunk evaluated and the production app rendered
 * blank. Dev mode serves modules one by one, so only a production build shows
 * it. This builds both apps that compile the web source and reads Rolldown's
 * own chunk metadata (not the minified output).
 */

const ROOT = path.resolve(__dirname, "../../..");
const WEB = path.join(ROOT, "apps/web");
const WEB_SRC = path.join(WEB, "src");
const SHARED_SRC = path.join(ROOT, "packages/shared/src");
const APP_MODULE = path.join(WEB_SRC, "App.tsx");

interface Chunk {
  type: "chunk";
  fileName: string;
  name: string;
  isEntry: boolean;
  imports: string[];
  modules: Record<string, unknown>;
}

const APPS = { web: WEB, demo: path.join(ROOT, "apps/demo") } as const;
type AppName = keyof typeof APPS;
const builds: Partial<Record<AppName, { outDir: string; chunks: Chunk[] }>> = {};

/** Module ids without their query suffix, the way they appear in chunk.modules. */
const cleanId = (id: string) => id.split("?")[0];
const stripExt = (p: string) => p.replace(/\.(tsx?|jsx?)$/, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

/** Every module the web source loads through lazy() or lazyWithRetry(), extension-less. */
function lazyModules(): Set<string> {
  const found = new Set<string>();
  for (const file of sourceFiles(WEB_SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(
      /\blazy(?:WithRetry)?\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g,
    )) {
      const spec = m[1];
      const resolved = spec.startsWith("@/")
        ? path.join(WEB_SRC, spec.slice(2))
        : path.resolve(path.dirname(file), spec);
      found.add(stripExt(resolved));
    }
  }
  return found;
}

function staticClosure(chunks: Chunk[], roots: Chunk[]): Chunk[] {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const seen = new Map<string, Chunk>();
  const todo = [...roots];
  while (todo.length > 0) {
    const chunk = todo.pop() as Chunk;
    if (seen.has(chunk.fileName)) continue;
    seen.set(chunk.fileName, chunk);
    for (const dep of chunk.imports) {
      const next = byFile.get(dep);
      if (!next) throw new Error(`${chunk.fileName} imports ${dep}, which the build did not emit`);
      todo.push(next);
    }
  }
  return [...seen.values()];
}

function staticCycles(chunks: Chunk[]): string[] {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const cycles: string[] = [];
  const visit = (file: string) => {
    state.set(file, 1);
    stack.push(file);
    for (const dep of byFile.get(file)?.imports ?? []) {
      if (state.get(dep) === 1) cycles.push([...stack.slice(stack.indexOf(dep)), dep].join(" -> "));
      else if (!state.has(dep)) visit(dep);
    }
    stack.pop();
    state.set(file, 2);
  };
  for (const c of chunks) if (!state.has(c.fileName)) visit(c.fileName);
  return cycles;
}

beforeAll(async () => {
  // Without a token the Sentry plugin is a no-op; with one it would upload
  // source maps for this throwaway build.
  delete process.env.SENTRY_AUTH_TOKEN;
  // The web apps build with their own Vite (Rolldown); the root Vitest bundles an older one.
  const vitePath = path.join(WEB, "node_modules/vite/dist/node/index.js");
  const { build } = (await import(pathToFileURL(vitePath).href)) as {
    build: (config: Record<string, unknown>) => Promise<{ output: Array<{ type: string }> }>;
  };
  for (const [name, root] of Object.entries(APPS) as [AppName, string][]) {
    const outDir = mkdtempSync(path.join(tmpdir(), `snapotter-${name}-build-`));
    builds[name] = { outDir, chunks: [] };
    const result = await build({
      root,
      configFile: path.join(root, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
    builds[name] = {
      outDir,
      chunks: result.output.filter((o): o is Chunk => o.type === "chunk"),
    };
  }
}, 240_000);

afterAll(() => {
  for (const b of Object.values(builds)) if (b) rmSync(b.outDir, { recursive: true, force: true });
});

function chunksOf(name: AppName): Chunk[] {
  const chunks = builds[name]?.chunks ?? [];
  if (chunks.length === 0) throw new Error(`the ${name} build produced no chunks`);
  return chunks;
}

describe("production builds keep @snapotter/shared in one chunk (#1296)", () => {
  it("found the lazy pages and panels to check", () => {
    // An empty set would make the checks below vacuous.
    expect(lazyModules().size).toBeGreaterThan(150);
  });

  describe.each(Object.keys(APPS) as AppName[])("%s", (name) => {
    it("puts the shared barrel and every non-locale shared module in the one shared chunk", () => {
      const chunks = chunksOf(name);
      const shared = chunks.filter((c) => c.name === "shared");
      expect(shared.map((c) => c.fileName)).toHaveLength(1);
      expect(Object.keys(shared[0].modules).map(cleanId)).toContain(
        path.join(SHARED_SRC, "index.ts"),
      );

      const stray = chunks
        .filter((c) => c.name !== "shared")
        .flatMap((c) =>
          Object.keys(c.modules)
            .map(cleanId)
            .filter(
              (id) => id.startsWith(SHARED_SRC) && !id.startsWith(path.join(SHARED_SRC, "i18n")),
            )
            .map((id) => `${path.relative(ROOT, id)} in ${c.fileName}`),
        );
      expect(stray).toEqual([]);
    });

    it("has no static import cycle between chunks", () => {
      expect(staticCycles(chunksOf(name))).toEqual([]);
    });

    it("loads no lazy page or panel before it is asked for", () => {
      const chunks = chunksOf(name);
      // The demo imports the whole app lazily after installing its mocks, so
      // its startup graph begins at the chunk that holds App.tsx.
      const roots = chunks.filter(
        (c) => c.isEntry || Object.keys(c.modules).map(cleanId).includes(APP_MODULE),
      );
      expect(roots.length).toBeGreaterThan(0);

      const lazy = lazyModules();
      const leaked = staticClosure(chunks, roots).flatMap((c) =>
        Object.keys(c.modules)
          .map((id) => stripExt(cleanId(id)))
          .filter((id) => lazy.has(id))
          .map((id) => `${path.relative(ROOT, id)} in ${c.fileName}`),
      );
      expect(leaked).toEqual([]);
    });
  });
});
