import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { bakeSvgDensity, openSvgAtDensity } from "../../../apps/api/src/lib/svg-density.js";
import { fixtureDir } from "../../fixtures/index.js";

const svg = (rootAttrs: string, body = "") =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${rootAttrs}>${body}</svg>`);

async function size(input: Buffer, density: number) {
  const { width, height } = await openSvgAtDensity(input, density).metadata();
  return [width, height];
}

/** Fraction of the top pixel row covered by opaque paint. */
async function opaqueRowFraction(input: Buffer, density: number): Promise<number> {
  const { data, info } = await openSvgAtDensity(input, density)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let x = 0; x < info.width; x++) if (data[x * 4 + 3] > 128) opaque++;
  return opaque / info.width;
}

describe("openSvgAtDensity (#4423)", () => {
  it("renders a pt-sized SVG once-scaled at 300 DPI, not squared", async () => {
    expect(await size(svg('width="640pt" height="426pt" viewBox="0 0 640 426"'), 300)).toEqual([
      2667, 1775,
    ]);
  });

  it("renders the reported potrace fixture at 2667x1775", async () => {
    const input = readFileSync(`${fixtureDir.formats}/sample.svg`);
    expect(await size(input, 300)).toEqual([2667, 1775]);
  });

  it.each([
    ["in", "2in", "1in", 600, 300],
    ["mm", "25.4mm", "50.8mm", 300, 600],
    ["cm", "2.54cm", "5.08cm", 300, 600],
    ["pc", "6pc", "3pc", 300, 150],
    ["px", "144px", "72px", 600, 300],
    ["unitless", "144", "72", 600, 300],
  ])("sizes a %s root as physical inches times DPI", async (_unit, w, h, ew, eh) => {
    expect(await size(svg(`width="${w}" height="${h}"`), 300)).toEqual([ew, eh]);
  });

  it("matches sharp's own output for px roots at every density", async () => {
    for (const density of [36, 96, 150, 300, 600]) {
      for (const [w, h] of [
        [17, 23],
        [400, 400],
        [640, 426],
      ]) {
        const input = svg(`width="${w}" height="${h}"`);
        const direct = await sharp(input, { density }).metadata();
        expect(await size(input, density)).toEqual([direct.width, direct.height]);
      }
    }
  });

  it("keeps inner physical lengths proportional to the canvas", async () => {
    const body = '<rect width="0.5in" height="0.5in" fill="red"/>';
    for (const root of [
      'width="2in" height="2in"',
      'width="144" height="144" viewBox="0 0 144 144"',
      'viewBox="0 0 144 144"',
      'width="100%" height="100%" viewBox="0 0 144 144"',
      'width="2in" viewBox="0 0 144 144"',
      'width="10em" height="10em" viewBox="0 0 144 144"',
      'width="20ex" height="20ex" viewBox="0 0 144 144"',
    ]) {
      expect(await opaqueRowFraction(svg(root, body), 72)).toBeCloseTo(0.25, 2);
      expect(await opaqueRowFraction(svg(root, body), 300)).toBeCloseTo(0.25, 2);
    }
  });

  it.each([
    ["only a viewBox", 'viewBox="0 0 144 72"', 600, 300],
    ["percentage sizes", 'width="100%" height="50%" viewBox="0 0 144 72"', 600, 300],
    ["only an absolute width", 'width="2in" viewBox="0 0 144 72"', 600, 300],
    ["only an absolute height", 'height="1in" viewBox="0 0 144 72"', 600, 300],
    [
      "a percentage width and an absolute height",
      'width="50%" height="1in" viewBox="0 0 144 72"',
      600,
      300,
    ],
    ["a fractional viewBox", 'viewBox="0 0 10.5 7.3"', 44, 30],
    ["an em width", 'width="12em" viewBox="0 0 144 72"', 600, 300],
  ])("sizes a root with %s from its viewBox (#4940)", async (_label, attrs, ew, eh) => {
    expect(await size(svg(attrs), 300)).toEqual([ew, eh]);
  });

  it.each([
    ["em", "12em", "6em", 600, 300],
    ["ex", "24ex", "12ex", 600, 300],
    ["mixed em and pt", "12em", "72pt", 600, 300],
  ])(
    "sizes a %s root from librsvg's 12px default font size (#5082)",
    async (_unit, w, h, ew, eh) => {
      expect(await size(svg(`width="${w}" height="${h}"`), 300)).toEqual([ew, eh]);
    },
  );

  it("matches sharp's own output for em and ex roots at density 72 (#5082)", async () => {
    for (const attrs of ['width="10em" height="10em"', 'width="7.5em" height="3ex"']) {
      const input = svg(attrs);
      const direct = await sharp(input, { density: 72 }).metadata();
      expect(await size(input, 72)).toEqual([direct.width, direct.height]);
    }
  });

  it("tags PNG and TIFF output with the requested DPI, not the 72 it rendered at", async () => {
    const input = svg('width="1in" height="1in"');
    for (const format of ["png", "tiff"] as const) {
      const out = await openSvgAtDensity(input, 300)[format]().toBuffer();
      expect((await sharp(out).metadata()).density).toBe(300);
    }
  });
});

describe("bakeSvgDensity", () => {
  it("rewrites the root size, adds a viewBox and drops to density 72", () => {
    const { buffer, density } = bakeSvgDensity(svg('width="640pt" height="426pt"'), 300);
    expect(density).toBe(72);
    const text = buffer.toString("utf-8");
    expect(text).toContain('viewBox="0 0 640 426"');
    expect(text).toMatch(/\swidth="2666\.66666667"/);
    expect(text).toMatch(/\sheight="1775"/);
  });

  it("keeps an existing viewBox and the attribute quote style", () => {
    const { buffer } = bakeSvgDensity(svg("width='1in' height='1in' viewBox='0 0 10 10'"), 144);
    const text = buffer.toString("utf-8");
    expect(text).toContain("width='144'");
    expect(text).toContain("height='144'");
    expect(text).toContain("viewBox='0 0 10 10'");
    expect(text.match(/viewBox/g)).toHaveLength(1);
  });

  it("only touches the root element", () => {
    const input = svg(
      'width="1in" height="1in"',
      '<svg width="2in" height="2in"/><rect width="1in" stroke-width="3pt"/>',
    );
    const text = bakeSvgDensity(input, 300).buffer.toString("utf-8");
    expect(text).toContain('<svg width="2in" height="2in"/>');
    expect(text).toContain('<rect width="1in" stroke-width="3pt"/>');
  });

  it("finds the root after an XML declaration and comments that mention <svg", () => {
    const input = Buffer.from(
      '﻿<?xml version="1.0"?>\n<!-- <svg width="9in"> -->\n<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="2in"/>',
    );
    const text = bakeSvgDensity(input, 72).buffer.toString("utf-8");
    expect(text).toContain('<!-- <svg width="9in"> -->');
    expect(text).toContain('width="72" height="144"');
  });

  it.each([
    ["a percentage width", 'width="100%" height="50pt"'],
    ["an em height and a root font-size", 'width="10pt" height="2em" font-size="20"'],
    ["no height and no viewBox", 'width="10pt"'],
    ["no size and no viewBox", ""],
    ["a zero-width viewBox", 'width="100%" viewBox="0 0 0 10"'],
    [
      "an em width and a font in its style",
      'width="10em" viewBox="0 0 10 10" style="font: 20px serif"',
    ],
    ["an ex size and a FONT-SIZE style", 'width="10ex" height="10ex" style="FONT-SIZE:20px"'],
    [
      "an em size and a CSS-escaped font style",
      'width="10em" height="10em" style="f\\6fnt-size:20px"',
    ],
    [
      "an em size and an XML-referenced font style",
      'width="10em" height="10em" style="&#102;ont-size:20px"',
    ],
    ["an uppercase em unit", 'width="10EM" height="10em"'],
    ["a malformed viewBox", 'viewBox="0 0 10"'],
    ["a hex viewBox", 'viewBox="0 0 0x10 10"'],
    ["a zero width", 'width="0" height="10pt"'],
    ["a non-numeric width", 'width="auto" height="10pt"'],
  ])("leaves a root with %s to sharp unchanged", (_label, attrs) => {
    const input = svg(attrs);
    const result = bakeSvgDensity(input, 300);
    expect(result.buffer).toBe(input);
    expect(result.density).toBe(300);
  });

  it.each([
    ["a style element", "<style>svg{font-size:20px}</style>"],
    [
      "a prefixed style element",
      '<s:style xmlns:s="http://www.w3.org/2000/svg">svg{font-size:20px}</s:style>',
    ],
    ["an uppercase STYLE element", "<STYLE>svg{font-size:20px}</STYLE>"],
  ])("leaves an em root to sharp when the document has %s (#5082)", (_label, body) => {
    const input = svg('width="10em" height="10em"', body);
    const result = bakeSvgDensity(input, 300);
    expect(result.buffer).toBe(input);
    expect(result.density).toBe(300);
  });

  it("leaves an em root to sharp behind an xml-stylesheet instruction (#5082)", () => {
    const input = Buffer.from(
      '<?xml-stylesheet type="text/css" href="data:text/css,svg{font-size:20px}"?><svg xmlns="http://www.w3.org/2000/svg" width="10em" height="10em"/>',
    );
    const result = bakeSvgDensity(input, 300);
    expect(result.buffer).toBe(input);
    expect(result.density).toBe(300);
  });

  it("leaves an em root to sharp when the document declares an entity (#5082)", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg [<!ENTITY s "&#60;style>svg{font-size:20px}&#60;/style>">]><svg xmlns="http://www.w3.org/2000/svg" width="10em" height="10em">&s;</svg>',
    );
    const result = bakeSvgDensity(input, 300);
    expect(result.buffer).toBe(input);
    expect(result.density).toBe(300);
  });

  it("bakes an em root whose inner elements set their own font-size (#5082)", () => {
    const input = svg(
      'width="10em" height="5ex"',
      '<text font-size="40" style="font-size:40px">x</text>',
    );
    const { buffer, density } = bakeSvgDensity(input, 300);
    expect(density).toBe(72);
    expect(buffer.toString("utf-8")).toContain('width="500" height="125"');
  });

  it("writes a missing root size from the viewBox and drops to density 72", () => {
    const { buffer, density } = bakeSvgDensity(svg('viewBox="0, 0, 144, 72"'), 300);
    expect(density).toBe(72);
    expect(buffer.toString("utf-8")).toContain(
      '<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg" viewBox="0, 0, 144, 72">',
    );
  });

  it("replaces a percentage size and derives a missing one from the viewBox aspect", () => {
    const text = bakeSvgDensity(svg('width="100%" viewBox="0 0 30 10"'), 144).buffer.toString(
      "utf-8",
    );
    expect(text).toContain('<svg height="20" xmlns="http://www.w3.org/2000/svg" width="60"');
    const tall = bakeSvgDensity(svg('height="1in" viewBox="0 0 10 20"'), 144).buffer.toString(
      "utf-8",
    );
    expect(tall).toContain('<svg width="72" xmlns="http://www.w3.org/2000/svg" height="144"');
  });

  it("finds the root after a DOCTYPE with an internal subset", () => {
    const input = Buffer.from(
      '<!DOCTYPE svg [<!ENTITY a "<svg width=\'9in\'>">]><svg width="1in" height="1in"/>',
    );
    expect(bakeSvgDensity(input, 72).buffer.toString("utf-8")).toContain(
      '<svg viewBox="0 0 72 72" width="72" height="72"/>',
    );
  });

  it("ignores width and height text inside another attribute's value", () => {
    const input = svg(`data-a=" width='100in' height='100in'" width="1in" height="1in"`);
    const text = bakeSvgDensity(input, 300).buffer.toString("utf-8");
    expect(text).toContain(`data-a=" width='100in' height='100in'"`);
    expect(text).toContain('width="300" height="300"');
    expect(text).toContain('viewBox="0 0 72 72"');
  });

  it("leaves a root with an unquoted or unterminated attribute unchanged", () => {
    for (const attrs of ['width=1in height="1in"', 'data-a="x>y" width="1in" height="1in"']) {
      const input = svg(attrs);
      expect(bakeSvgDensity(input, 300)).toEqual({ buffer: input, density: 300 });
    }
  });

  it("leaves a root whose scaled size overflows unchanged", () => {
    const input = svg('width="1e306in" height="1in"');
    expect(bakeSvgDensity(input, 300)).toEqual({ buffer: input, density: 300 });
  });

  it("parses hostile lengths and attribute runs in linear time", () => {
    const started = performance.now();
    for (const attrs of [
      `width="${"1".repeat(100_000)}x" height="1in"`,
      `width="1${" ".repeat(100_000)}x" height="1in"`,
      `width="1.${"1".repeat(100_000)}e" height="1in"`,
      `${" ".repeat(100_000)}x`,
      `width="1in"${" ".repeat(100_000)}height=`,
      `width="1in" height="${"1".repeat(100_000)}`,
    ]) {
      const input = svg(attrs);
      expect(bakeSvgDensity(input, 300).buffer).toBe(input);
    }
    // The backtracking pattern this replaced took about 10 s on the first input alone.
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  it("leaves a namespace-prefixed or missing root unchanged", () => {
    for (const input of [
      Buffer.from('<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width="1in" height="1in"/>'),
      Buffer.from("<html></html>"),
      Buffer.from('<?xml version="1.0"'),
      Buffer.from('<!DOCTYPE svg [<!ENTITY a "x">'),
    ]) {
      expect(bakeSvgDensity(input, 300)).toEqual({ buffer: input, density: 300 });
    }
  });
});
