import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Both public sites deploy to Cloudflare Pages, which also serves every page on
 * the project's pages.dev hostname (#5030). Those mirrors must answer with
 * `X-Robots-Tag: noindex` while the custom domains stay indexable. This reads the
 * real `_headers` files and resolves them the way Cloudflare documents: a rule
 * is a URL pattern (path-only, or absolute with a host), `:name` matches one
 * label, `*` matches anything, and every matching rule's headers apply.
 */

const ROOT = path.resolve(__dirname, "../../..");

interface Rule {
  pattern: RegExp;
  absolute: boolean;
  headers: Array<[string, string]>;
}

function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part) => {
      if (part === "*") return ".*";
      if (part.startsWith(":")) return "[^./]+";
      return part.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${source}$`);
}

function parseHeaders(file: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of readFileSync(path.join(ROOT, file), "utf8").split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      const sep = line.indexOf(":");
      rules.at(-1)?.headers.push([line.slice(0, sep).trim(), line.slice(sep + 1).trim()]);
      continue;
    }
    const url = line.trim();
    const absolute = url.startsWith("https://");
    rules.push({
      pattern: toRegExp(absolute ? url.slice("https://".length) : url),
      absolute,
      headers: [],
    });
  }
  return rules;
}

function robotsFor(rules: Rule[], url: string): string[] {
  const { host, pathname } = new URL(url);
  return rules
    .filter((r) => r.pattern.test(r.absolute ? `${host}${pathname}` : pathname))
    .flatMap((r) => r.headers)
    .filter(([name]) => name.toLowerCase() === "x-robots-tag")
    .map(([, value]) => value);
}

const SITES = [
  {
    file: "apps/landing/public/_headers",
    project: "snapotter-landing",
    domain: "snapotter.com",
    paths: ["/", "/alternatives/stirling-pdf/", "/tools/image/resize/", "/sitemap-index.xml"],
  },
  {
    file: "apps/docs/public/_headers",
    project: "snapotter-docs",
    domain: "docs.snapotter.com",
    paths: ["/", "/guide/getting-started", "/api/", "/sitemap.xml"],
  },
];

describe.each(SITES)("$file", ({ file, project, domain, paths }) => {
  const rules = parseHeaders(file);

  it("noindexes the pages.dev project hostname", () => {
    for (const p of paths) {
      expect(robotsFor(rules, `https://${project}.pages.dev${p}`), p).toContain("noindex");
    }
  });

  it("noindexes branch alias and deployment hostnames under the project", () => {
    for (const sub of ["main", "a1b2c3d4", "fix-5030"]) {
      expect(robotsFor(rules, `https://${sub}.${project}.pages.dev/`), sub).toContain("noindex");
    }
  });

  it("leaves the custom domain indexable", () => {
    for (const p of paths) {
      const robots = robotsFor(rules, `https://${domain}${p}`);
      expect(
        robots.some((v) => v.includes("noindex")),
        `${domain}${p}`,
      ).toBe(false);
    }
  });
});

describe("the _headers matcher this test relies on", () => {
  const rules = [
    { pattern: toRegExp(":project.pages.dev/*"), absolute: true, headers: [["X-Robots-Tag", "a"]] },
  ] as Rule[];

  it("does not let a host placeholder swallow a dot or a different apex", () => {
    expect(robotsFor(rules, "https://x.pages.dev/")).toEqual(["a"]);
    expect(robotsFor(rules, "https://x.y.pages.dev/")).toEqual([]);
    expect(robotsFor(rules, "https://pages.dev.evil.com/")).toEqual([]);
    expect(robotsFor(rules, "https://snapotter.com/")).toEqual([]);
  });
});
