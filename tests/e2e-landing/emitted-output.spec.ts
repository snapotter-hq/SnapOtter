// tests/e2e-landing/emitted-output.spec.ts
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Release contract for the built landing site: every same-origin reference in the
 * emitted HTML has to resolve to a file the build actually wrote.
 *
 * A rendered-page walk cannot cover this. Playwright would have to visit all 798
 * pages to see the `<link rel="alternate">` heads where the breakage lives, and a
 * page that is never visited is a page whose dead links nobody notices. Reading
 * `dist` directly checks all of them in about a second.
 *
 * The landing harness builds before it previews, so `dist` is the exact tree the
 * preview server is serving.
 */

const DIST = path.resolve(__dirname, "../../apps/landing/dist");
const SITE_ORIGIN = "https://snapotter.com";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const REFERENCE_RE =
  /<(a|link|script|img|source|iframe|form|video|audio|track)\b[^>]*?\s(href|src|action|srcset)\s*=\s*("([^"]*)"|'([^']*)')/gi;

interface Emitted {
  files: Set<string>;
  htmlFiles: string[];
  redirects: Map<string, string>;
}

function readEmitted(): Emitted {
  const all = walk(DIST).map((f) => path.relative(DIST, f).split(path.sep).join("/"));
  const redirects = new Map<string, string>();
  const redirectsFile = path.join(DIST, "_redirects");
  if (fs.existsSync(redirectsFile)) {
    for (const line of fs.readFileSync(redirectsFile, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [from, to] = trimmed.split(/\s+/);
      // Splat and placeholder rules are skipped on purpose. Letting a wildcard
      // satisfy a target would green the crawl over pages that do not exist.
      if (!from || !to || from.includes("*") || from.includes(":")) continue;
      redirects.set(from.replace(/\/$/, "") || "/", to);
    }
  }
  return {
    files: new Set(all),
    htmlFiles: all.filter((f) => f.endsWith(".html")),
    redirects,
  };
}

/** On-disk paths a pathname could be served from under static hosting. */
function candidates(pathname: string): string[] {
  const clean = decodeURIComponent(pathname).replace(/^\//, "");
  if (clean === "") return ["index.html"];
  if (clean.endsWith("/")) return [clean, `${clean}index.html`];
  return [clean, `${clean}.html`, `${clean}/index.html`];
}

function resolvesOnDisk(emitted: Emitted, pathname: string): boolean {
  if (candidates(pathname).some((c) => emitted.files.has(c))) return true;
  const redirect = emitted.redirects.get(pathname.replace(/\/$/, "") || "/");
  if (!redirect) return false;
  return candidates(new URL(redirect, "http://local").pathname).some((c) => emitted.files.has(c));
}

test.describe("landing emitted output", () => {
  test("every same-origin reference resolves to an emitted file", () => {
    const emitted = readEmitted();
    expect(emitted.htmlFiles.length).toBeGreaterThan(500);

    const missing = new Map<string, { count: number; sources: Set<string> }>();
    let sameOrigin = 0;

    for (const rel of emitted.htmlFiles) {
      const html = fs.readFileSync(path.join(DIST, rel), "utf8");
      const dirname = path.dirname(rel);
      const base = `http://local/${dirname === "." ? "" : `${dirname}/`}`;

      for (const match of html.matchAll(REFERENCE_RE)) {
        const attr = match[2].toLowerCase();
        const raw = (match[4] ?? match[5] ?? "").trim();
        if (!raw) continue;
        const values =
          attr === "srcset" ? raw.split(",").map((v) => v.trim().split(/\s+/)[0]) : [raw];

        for (const value of values) {
          if (!value || /^(mailto:|tel:|javascript:|data:|blob:|#)/i.test(value)) continue;
          let url: URL;
          try {
            url = new URL(value, base);
          } catch {
            continue;
          }
          const sameSite = url.hostname === "local" || url.origin === SITE_ORIGIN;
          if (!sameSite) continue;
          sameOrigin += 1;
          if (resolvesOnDisk(emitted, url.pathname)) continue;
          const entry = missing.get(url.pathname) ?? { count: 0, sources: new Set<string>() };
          entry.count += 1;
          entry.sources.add(rel);
          missing.set(url.pathname, entry);
        }
      }
    }

    expect(sameOrigin).toBeGreaterThan(10_000);

    const sample = [...missing.entries()]
      .slice(0, 8)
      .map(([target, v]) => `${target} (from ${[...v.sources][0]})`);
    expect(
      [...missing.keys()].length,
      `${missing.size} same-origin targets are referenced but never emitted. First few:\n  ${sample.join("\n  ")}`,
    ).toBe(0);
  });

  test("English-only pages advertise no localized alternate that was never built", () => {
    const emitted = readEmitted();
    // Tool-detail pages and /self-hosted/ are built in English only. Their
    // hreflang set must therefore be the self-reference plus x-default, never a
    // per-locale fan-out at a URL the build did not write.
    const englishOnly = emitted.htmlFiles.filter(
      (f) =>
        /^tools\/(image|video|audio|pdf|files)\/[^/]+\/index\.html$/.test(f) ||
        /^self-hosted\/([^/]+\/)?index\.html$/.test(f),
    );
    expect(englishOnly.length).toBeGreaterThan(200);

    const offenders: string[] = [];
    for (const rel of englishOnly) {
      const html = fs.readFileSync(path.join(DIST, rel), "utf8");
      for (const match of html.matchAll(
        /<link\b[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']+)["']/gi,
      )) {
        const target = new URL(match[1], SITE_ORIGIN);
        if (target.origin !== SITE_ORIGIN) continue;
        if (!resolvesOnDisk(emitted, target.pathname)) {
          offenders.push(`${rel} -> ${target.pathname}`);
        }
      }
    }
    expect(
      offenders,
      `dangling hreflang alternates:\n  ${offenders.slice(0, 8).join("\n  ")}`,
    ).toEqual([]);
  });
});
