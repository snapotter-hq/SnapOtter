// @vitest-environment node

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * #1296: a @snapotter/shared export used only by lazily loaded web code made
 * Rolldown place that shared module in the lazy chunk, and the shared barrel
 * chunk then imported the lazy chunk back. The cycle left shared bindings
 * undefined when the first chunk evaluated and the production app rendered
 * blank. Dev mode serves modules one by one, so only the built bundle shows it.
 *
 * The invariant that failed: no lazily loaded page or tool panel may sit in
 * the entry's static import closure. This builds the real app and checks it.
 */

const ROOT = path.resolve(__dirname, "../../..");
const WEB = path.join(ROOT, "apps/web");

/** Basenames of every module App.tsx and the tool registry load through lazy(). */
function lazyModuleNames(): string[] {
  const names = new Set<string>();
  for (const file of ["src/App.tsx", "src/lib/tool-registry.tsx"]) {
    const src = readFileSync(path.join(WEB, file), "utf8");
    for (const m of src.matchAll(/lazy\(\s*\(\)\s*=>\s*import\(\s*["']([^"']+)["']/g)) {
      names.add(path.basename(m[1]));
    }
  }
  return [...names];
}

/** Static import graph of the built chunks, walked from the index.html entry. */
function entryClosure(dist: string): string[] {
  const assets = path.join(dist, "assets");
  const html = readFileSync(path.join(dist, "index.html"), "utf8");
  const entry = html.match(/<script[^>]+src="\.?\/assets\/([^"]+\.js)"/)?.[1];
  if (!entry) throw new Error("no entry script in the built index.html");

  const statics = new Map<string, string[]>();
  for (const f of readdirSync(assets).filter((f) => f.endsWith(".js"))) {
    const src = readFileSync(path.join(assets, f), "utf8");
    statics.set(
      f,
      [...src.matchAll(/import(?:[^"'`()]*?from)?\s*["'`]\.\/([^"'`]+\.js)["'`]/g)].map(
        (m) => m[1],
      ),
    );
  }

  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length > 0) {
    const f = todo.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of statics.get(f) ?? []) todo.push(d);
  }
  return [...seen];
}

// apps/demo builds the same web source with its own config, so it gets the same check.
const APPS = { web: WEB, demo: path.join(ROOT, "apps/demo") } as const;
const dists: Partial<Record<keyof typeof APPS, string>> = {};

beforeAll(async () => {
  // The web apps build with their own Vite (Rolldown); the root Vitest bundles an older one.
  const vitePath = path.join(WEB, "node_modules/vite/dist/node/index.js");
  const { build } = (await import(pathToFileURL(vitePath).href)) as {
    build: (config: Record<string, unknown>) => Promise<unknown>;
  };
  for (const [name, root] of Object.entries(APPS) as [keyof typeof APPS, string][]) {
    const outDir = mkdtempSync(path.join(tmpdir(), `snapotter-${name}-build-`));
    dists[name] = outDir;
    await build({
      root,
      configFile: path.join(root, "vite.config.ts"),
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });
  }
}, 240_000);

afterAll(() => {
  for (const dir of Object.values(dists)) if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("production build keeps lazy chunks lazy (#1296)", () => {
  it("found the lazy pages and tool panels to check", () => {
    // Guards the regex above: an empty list would make the real check vacuous.
    expect(lazyModuleNames().length).toBeGreaterThan(150);
  });

  it.each(Object.keys(APPS) as (keyof typeof APPS)[])(
    "%s: loads no lazy page or tool panel as part of the first load",
    (name) => {
      const closure = entryClosure(dists[name] as string);
      const lazy = lazyModuleNames();
      const leaked = closure.filter((chunk) => lazy.some((n) => chunk.startsWith(`${n}-`)));

      expect(leaked, `lazy chunks pulled into the entry graph: ${leaked.join(", ")}`).toEqual([]);
    },
  );
});
