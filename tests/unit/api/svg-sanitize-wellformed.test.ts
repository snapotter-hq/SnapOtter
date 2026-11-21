import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Same fixed 10MB cap as svg-sanitize.test.ts, so the size guard is deterministic.
vi.mock("../../../apps/api/src/config.js", () => ({
  env: { MAX_SVG_SIZE_MB: 10 },
}));

import { sanitizeSvg } from "../../../apps/api/src/lib/svg-sanitize.js";

// fast-xml-parser is an apps/api dependency, so resolve it from there.
const require = createRequire(path.resolve(__dirname, "../../../apps/api/package.json"));
const { XMLValidator } = require("fast-xml-parser") as typeof import("fast-xml-parser");

function clean(svg: string): string {
  return sanitizeSvg(Buffer.from(svg)).toString("utf-8");
}

function svgAround(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</svg>`;
}

// Neutralising a URI must keep the quoting the input used. Inserting a quote
// closes the attribute early and the output is no longer well-formed XML, so
// svgo rejects it and other consumers get broken markup (#5056).
const URIS = ["data:image/png;base64,AAAA", "https://evil.com/t", "file:///etc/passwd"];

describe("sanitizeSvg keeps url() rewrites well-formed (#5056)", () => {
  for (const uri of URIS) {
    const cases = [
      `<rect fill="url(${uri})"/>`,
      `<rect fill="url('${uri}')"/>`,
      `<rect fill='url(${uri})'/>`,
      `<rect fill='url("${uri}")'/>`,
      `<rect style="fill:url( '${uri}' )"/>`,
      `<rect style='fill:url(${uri})'/>`,
      `<style>.a{fill:url(${uri})}.b{fill:url("${uri}")}</style>`,
      `<rect fill="url(&quot;${uri}&quot;)"/>`,
      `<rect fill='url(&apos;${uri}&apos;)'/>`,
    ];
    for (const inner of cases) {
      it(`neutralises ${inner}`, () => {
        const out = clean(svgAround(inner));
        expect(XMLValidator.validate(out)).toBe(true);
        expect(out).not.toContain(uri);
        expect(out.toLowerCase()).toContain("url(");
      });
    }
  }

  it("neutralises a numeric-entity scheme, case-insensitively", () => {
    const out = clean(svgAround(`<rect fill="URL(&#100;ata:x)"/>`));
    expect(XMLValidator.validate(out)).toBe(true);
    expect(out).toContain(`fill="url(data:,x)"`);
  });

  it("keeps an entity-encoded url() quote encoded", () => {
    const out = clean(svgAround(`<rect fill="url(&quot;https://evil.com/t&quot;)"/>`));
    expect(out).toContain(`fill="url(&quot;data:,evil.com/t&quot;)"`);
  });

  it("keeps the CSS string balanced inside a <style> element", () => {
    const out = clean(svgAround(`<style>.a{fill:url("https://evil.com/t")}.b{fill:red}</style>`));
    expect(out).toContain(`url("data:,evil.com/t")`);
    expect(out).toContain(".b{fill:red}");
  });
});

describe("sanitizeSvg keeps href rewrites well-formed (#5056)", () => {
  for (const uri of [...URIS, "javascript:alert(1)"]) {
    for (const inner of [
      `<a href="${uri}"><text>c</text></a>`,
      `<a href='${uri}'><text>c</text></a>`,
      `<a xlink:href=' ${uri}'><text>c</text></a>`,
    ]) {
      it(`neutralises ${inner}`, () => {
        const out = clean(svgAround(inner));
        expect(XMLValidator.validate(out)).toBe(true);
        expect(out).not.toContain(uri);
        expect(out).toContain("href=");
      });
    }
  }

  it("keeps a single-quoted href single-quoted", () => {
    const out = clean(svgAround(`<a href='javascript:alert(1)'><text>c</text></a>`));
    expect(out).toContain(`href='data:,alert(1)'`);
  });
});

// Both rewrites allow whitespace before and after an optional quote. If the two
// whitespace runs were adjacent, a long run of spaces could be split between
// them in every way, which is quadratic: 50K spaces took about 30 seconds.
describe("sanitizeSvg URI rewrites stay linear on long whitespace runs", () => {
  it("handles 50K spaces after url( and href= quickly", () => {
    const ws = " ".repeat(50_000);
    const input = svgAround(`<style>.a{fill:url(${ws}x)}</style><a href=${ws}x><text>c</text></a>`);
    const start = performance.now();
    clean(input);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
