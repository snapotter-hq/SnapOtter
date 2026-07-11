// scripts/i18n/adapters/docs-md.mjs
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { localeCodes } from "../lib/shared-i18n.mjs";
import { slugify } from "../lib/slugify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// scripts/i18n/adapters -> repo root -> apps/docs
const DEFAULT_ROOT = join(HERE, "..", "..", "..", "apps", "docs");

const LOCALE_DIRS = new Set(localeCodes().filter((c) => c !== "en"));
const SKIP_DIRS = new Set(["node_modules", ".vitepress", "public", ...LOCALE_DIRS]);

// Docs-dialect masking tokens (distinct delimiters from the shared mask lib so
// the two layers never collide).
const DTOKEN = (i) => `⟦DOCS${i}⟧`;
const DTOKEN_RE = /⟦DOCS\d+⟧/g;

/**
 * List every root markdown file (relative POSIX path), excluding locale subtrees
 * and non-content dirs.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function listRootMarkdown(root) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        await walk(abs);
      } else if (ent.name.endsWith(".md")) {
        out.push(relative(root, abs).split(sep).join("/"));
      }
    }
  }
  await walk(root);
  return out.sort();
}

/**
 * Split frontmatter from body. Returns { fm, body } where fm is the raw
 * frontmatter block WITHOUT the fences (or null), and body is everything after.
 * @param {string} text
 * @returns {{ fm: string|null, body: string }}
 */
function splitFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: null, body: text };
  return { fm: m[1], body: text.slice(m[0].length) };
}

/**
 * Read a single scalar value from a raw frontmatter block, e.g. key: value.
 * @param {string|null} fm
 * @param {string} key
 * @returns {string|undefined}
 */
function fmGet(fm, key) {
  if (!fm) return undefined;
  const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  if (!m) return undefined;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * Split a body into fenced-code segments and prose segments so heading/anchor and
 * docs-mask logic never touch lines inside ``` fences.
 * @param {string} body
 * @returns {Array<{ code: boolean, text: string }>}
 */
function segmentFences(body) {
  const parts = [];
  const re = /(^|\n)(```|~~~)[\s\S]*?\n\2/g;
  let last = 0;
  let m;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push({ code: false, text: body.slice(last, m.index) });
    parts.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ code: false, text: body.slice(last) });
  return parts;
}

/**
 * Inject `{#slug}` into ATX headings that lack an explicit anchor. Idempotent.
 * Only runs over non-code segments.
 * @param {string} body
 * @returns {string}
 */
function injectAnchors(body) {
  // De-duplicate slugs exactly like markdown-it-anchor: a base slug already used
  // in the file gets "-1", "-2", ... appended (start index 1). Explicit {#id}
  // anchors already in the source claim their slot too, so injected slugs never
  // collide with them. Seen-set spans every prose segment, matching VitePress.
  const seen = new Set();
  const unique = (base) => {
    let slug = base;
    let i = 1;
    while (seen.has(slug)) {
      slug = `${base}-${i}`;
      i += 1;
    }
    seen.add(slug);
    return slug;
  };
  return segmentFences(body)
    .map((seg) => {
      if (seg.code) return seg.text;
      return seg.text.replace(/^(#{1,6})[ \t]+(.+?)[ \t]*$/gm, (line, hashes, title) => {
        const explicit = title.match(/\{#([^}]+)\}\s*$/);
        if (explicit) {
          seen.add(explicit[1]); // pre-existing anchor claims its slug
          return line;
        }
        const clean = title.replace(/[ \t]+#*$/, ""); // drop optional closing ATX hashes
        return `${hashes} ${clean} {#${unique(slugify(clean))}}`;
      });
    })
    .join("");
}

/**
 * Docs-dialect pre-mask over non-code segments: hide `:::` container markers
 * (keep the title label), `[[toc]]`, and explicit `{#anchor}` slugs so the model
 * never rewrites them. Returns masked text plus the token table.
 * @param {string} body
 * @returns {{ masked: string, tokens: string[] }}
 */
function maskDocs(body) {
  const tokens = [];
  const push = (v) => {
    tokens.push(v);
    return DTOKEN(tokens.length - 1);
  };
  const masked = segmentFences(body)
    .map((seg) => {
      if (seg.code) return seg.text;
      let out = seg.text;
      // ::: type  (mask the "::: type " marker, leave the title text after it)
      out = out.replace(/^(:{3,})[ \t]*([a-zA-Z-]+)[ \t]*/gm, (_m, colons, type) =>
        push(`${colons} ${type} `),
      );
      // bare closing :::
      out = out.replace(/^:{3,}[ \t]*$/gm, (m) => push(m));
      // [[toc]]
      out = out.replace(/\[\[toc\]\]/gi, (m) => push(m));
      // explicit {#anchor}
      out = out.replace(/\{#[^}\n]+\}/g, (m) => push(m));
      return out;
    })
    .join("");
  return { masked, tokens };
}

/**
 * Restore docs-dialect tokens.
 * @param {string} masked
 * @param {string[]} tokens
 * @returns {string}
 */
function restoreDocs(masked, tokens) {
  return String(masked).replace(DTOKEN_RE, (t) => {
    const m = t.match(/DOCS(\d+)/);
    const i = m ? Number(m[1]) : Number.NaN;
    return tokens[i] ?? t;
  });
}

/**
 * Rewrite internal absolute links (/guide/x, /tools/y, /api/z) to /<locale>/...
 * Leaves external URLs, already-prefixed links, and root asset paths alone.
 * @param {string} body
 * @param {string} locale
 * @returns {string}
 */
function rewriteLinks(body, locale) {
  return body.replace(/(\]\()(\/[^)\s]*)(\))/g, (_m, open, url, close) => {
    if (url.startsWith(`/${locale}/`)) return `${open}${url}${close}`;
    // Do not prefix asset paths VitePress serves from root public/.
    if (/^\/(fonts|screenshots|logo|favicon|apple-touch|og-|llms)/.test(url)) {
      return `${open}${url}${close}`;
    }
    return `${open}/${locale}${url}${close}`;
  });
}

/**
 * Insert or replace scalar frontmatter keys, preserving existing ones.
 * @param {string} text
 * @param {Record<string,string>} fields
 * @returns {string}
 */
function upsertFrontmatter(text, fields) {
  const { fm, body } = splitFrontmatter(text);
  const lines = fm != null ? fm.split("\n") : [];
  const seen = new Set();
  const next = lines.map((line) => {
    const m = line.match(/^([A-Za-z0-9_]+):/);
    if (m && fields[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}: ${fields[m[1]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(fields)) {
    if (!seen.has(k)) next.push(`${k}: ${v}`);
  }
  return `---\n${next.join("\n")}\n---\n${body}`;
}

/**
 * Double-quote bare `description`/`title` frontmatter values so a translated
 * value containing a colon, `#`, or other YAML-significant character does not
 * break frontmatter parsing (VitePress loads it as YAML).
 * @param {string} text
 * @returns {string}
 */
export function quoteFrontmatterScalars(text) {
  const { fm, body } = splitFrontmatter(text);
  if (fm == null) return text;
  const next = fm.split("\n").map((line) => {
    const m = line.match(/^(description|title):[ \t]*(.*)$/);
    if (!m) return line;
    const val = m[2];
    // Leave empty, already-quoted, or block-scalar values alone.
    if (val === "" || /^["'|>]/.test(val)) return line;
    const escaped = val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `${m[1]}: "${escaped}"`;
  });
  return `---\n${next.join("\n")}\n---\n${body}`;
}

/** Recursively list markdown under a locale dir, relative + POSIX. */
async function listLocaleMarkdown(dir) {
  const out = [];
  async function walk(d) {
    const entries = await readdir(d, { withFileTypes: true });
    for (const ent of entries) {
      const abs = join(d, ent.name);
      if (ent.isDirectory()) await walk(abs);
      else if (ent.name.endsWith(".md")) out.push(relative(dir, abs).split(sep).join("/"));
    }
  }
  await walk(dir);
  return out.sort();
}

/**
 * Build the docs adapter. `root` defaults to apps/docs; tests override it.
 * @param {{ root?: string }} [opts]
 */
export function createDocsAdapter({ root = DEFAULT_ROOT } = {}) {
  // id -> docs token table, populated by extract() and consumed by write() in the
  // same run so the shared translator never needs to know about docs tokens.
  const tokenTables = new Map();

  return {
    name: "docs",

    async extract() {
      const files = await listRootMarkdown(root);
      const units = [];
      for (const id of files) {
        const abs = join(root, id);
        const original = await readFile(abs, "utf8");
        const { fm, body } = splitFrontmatter(original);
        const anchored = injectAnchors(body);
        const rebuilt = fm != null ? `---\n${fm}\n---\n${anchored}` : anchored;
        // Persist anchored English source in place (idempotent) so the running
        // site and every locale share the same stable slugs.
        if (rebuilt !== original) await writeFile(abs, rebuilt, "utf8");
        const { masked, tokens } = maskDocs(anchored);
        tokenTables.set(id, tokens);
        const sourceText = fm != null ? `---\n${fm}\n---\n${masked}` : masked;
        units.push({ id, sourceText, kind: "markdown" });
      }
      return units;
    },

    async load(locale) {
      const dir = join(root, locale);
      const map = new Map();
      let files = [];
      try {
        files = await listLocaleMarkdown(dir);
      } catch {
        return map; // no locale subtree yet
      }
      for (const rel of files) {
        const text = await readFile(join(dir, rel), "utf8");
        const { fm } = splitFrontmatter(text);
        map.set(rel, {
          text,
          sourceHash: fmGet(fm, "i18n_source_hash") ?? "",
          provenance: fmGet(fm, "i18n_provenance") === "human" ? "human" : "machine",
          outputHash: fmGet(fm, "i18n_output_hash") ?? "",
          stale: fmGet(fm, "i18n_stale") === "true",
        });
      }
      return map;
    },

    async write(locale, entries) {
      for (const [id, entry] of entries) {
        const abs = join(root, locale, id);
        await mkdir(dirname(abs), { recursive: true });
        const table = tokenTables.get(id) ?? [];
        const undone = restoreDocs(entry.text, table);
        const linked = quoteFrontmatterScalars(rewriteLinks(undone, locale));
        const withMeta = upsertFrontmatter(linked, {
          i18n_source_hash: entry.sourceHash,
          i18n_provenance: entry.provenance,
          i18n_output_hash: entry.outputHash,
          ...(entry.stale ? { i18n_stale: "true" } : {}),
        });
        await writeFile(abs, withMeta, "utf8");
      }
    },

    // Adapter extra (not part of the 3-method contract): write the English body
    // under the locale path, flagged so a real translation replaces it later.
    async writeFallback(locale, id) {
      const abs = join(root, locale, id);
      const original = await readFile(join(root, id), "utf8");
      await mkdir(dirname(abs), { recursive: true });
      const linked = rewriteLinks(original, locale);
      const flagged = upsertFrontmatter(linked, { i18n_fallback: "true" });
      await writeFile(abs, flagged, "utf8");
    },
  };
}

export const adapter = createDocsAdapter();
