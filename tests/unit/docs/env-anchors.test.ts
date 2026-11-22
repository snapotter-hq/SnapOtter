import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { envAnchorId, envAnchors } from "../../../apps/docs/.vitepress/env-anchors.mjs";

const root = resolve(import.meta.dirname, "../../..");
const docs = resolve(root, "apps/docs");
const config = readFileSync(resolve(docs, ".vitepress/config.mts"), "utf8");

// vitepress is a dependency of apps/docs only, so resolve it from there.
const vitepressEntry = createRequire(resolve(docs, "package.json")).resolve("vitepress");

type Renderer = { render: (src: string, env: Record<string, unknown>) => string };
let md: Renderer;

beforeAll(async () => {
  const vitepress = await import(pathToFileURL(vitepressEntry).href);
  md = await vitepress.createMarkdownRenderer(docs, { config: (m: never) => envAnchors(m) });
});

const render = (relativePath: string, src = readFileSync(resolve(docs, relativePath), "utf8")) =>
  md.render(src, { relativePath });

const idsOf = (html: string) => new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));

const TABLE = "| Variable | Default |\n|---|---|\n| `MAX_WORKER_THREADS` | `0` |\n| `a_b` | x |\n";

describe("envAnchorId", () => {
  it("derives a stable kebab-case id from the variable name", () => {
    expect(envAnchorId("MAX_WORKER_THREADS")).toBe("env-max-worker-threads");
    expect(envAnchorId("S3_BUCKET")).toBe("env-s3-bucket");
  });
});

describe("envAnchors markdown rule", () => {
  it("anchors each variable row of the configuration tables", () => {
    const ids = idsOf(render("guide/configuration.md"));
    const names = [
      ...readFileSync(resolve(docs, "guide/configuration.md"), "utf8").matchAll(
        /^\| `([A-Z][A-Z0-9_]*)`/gm,
      ),
    ].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(50);
    for (const name of names) expect(ids, name).toContain(envAnchorId(name));
  });

  it("anchors the OIDC variable table too", () => {
    expect(idsOf(render("guide/oidc.md"))).toContain("env-oidc-provider-name");
  });

  // A translation can trail English by a few rows, but every id it has must be
  // the English one, so a link never needs per-locale rewriting.
  it("gives a translated page the English ids", () => {
    for (const page of ["guide/configuration.md", "guide/oidc.md"]) {
      const en = idsOf(render(page));
      const ja = [...idsOf(render(`ja/${page}`))].filter((id) => id.startsWith("env-"));
      expect(ja.length, page).toBeGreaterThan(10);
      for (const id of ja) expect(en, page).toContain(id);
    }
  });

  it("puts the id on the first cell only, and only for an env var name", () => {
    const html = render("guide/configuration.md", TABLE);
    expect(html).toContain('<td id="env-max-worker-threads"><code>MAX_WORKER_THREADS</code></td>');
    expect(html.match(/ id="env-/g)).toHaveLength(1);
  });

  it("leaves tables on other pages alone", () => {
    expect(render("guide/low-resource.md", TABLE)).not.toContain('id="env-');
    expect(render("api/errors.md")).not.toContain('id="env-');
  });

  it("is wired into the VitePress markdown config", () => {
    expect(config).toMatch(/import \{ envAnchors \} from "\.\/env-anchors\.mts"/);
    expect(config).toMatch(/config:\s*\(md\)\s*=>\s*\{?\s*envAnchors\(md\)/);
  });
});

// Every guide link into a variable's anchor must land on a real one, in every
// locale tree, or the reader's click goes nowhere again.
describe("links to variable anchors", () => {
  const locales = readdirSync(docs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^[a-z]{2}(-[A-Z]{2})?$/.test(d.name))
    .map((d) => d.name);
  const guides = ["getting-started", "deployment", "low-resource"];

  it("link the variables these guides mention to their definitions", () => {
    const link = /\]\(\/guide\/(configuration|oidc)#env-[a-z0-9-]+\)/;
    for (const guide of guides) {
      expect(link.test(readFileSync(resolve(docs, `guide/${guide}.md`), "utf8")), guide).toBe(true);
    }
  });

  it("resolve in English and every locale", () => {
    const targets = new Map<string, Set<string>>();
    const idsFor = (prefix: string, page: string) => {
      const key = `${prefix}${page}`;
      if (!targets.has(key)) targets.set(key, idsOf(render(`${key}.md`)));
      return targets.get(key) as Set<string>;
    };
    for (const prefix of ["", ...locales.map((l) => `${l}/`)]) {
      for (const guide of guides) {
        const text = readFileSync(resolve(docs, `${prefix}guide/${guide}.md`), "utf8");
        const links = [
          ...text.matchAll(/\]\(\/([a-zA-Z-]+\/)?guide\/(configuration|oidc)#(env-[^)]+)\)/g),
        ];
        for (const [link, linkLocale = "", page, id] of links) {
          expect(linkLocale, `${prefix}${guide}: ${link}`).toBe(prefix);
          expect(idsFor(prefix, `guide/${page}`), `${prefix}${guide}: ${link}`).toContain(id);
        }
      }
    }
  });
});
