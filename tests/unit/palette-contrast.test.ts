import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the Otter Orange palette against WCAG AA drift (issue #557).
 * Parses the design tokens straight out of the two globals.css files and
 * recomputes contrast with the same math axe-core uses, so any token edit
 * that breaks AA fails unit tests on the PR, not a nightly axe run.
 */

const WEB_CSS = fs.readFileSync(
  path.resolve(__dirname, "../../apps/web/src/styles/globals.css"),
  "utf-8",
);
const LANDING_CSS = fs.readFileSync(
  path.resolve(__dirname, "../../apps/landing/src/styles/globals.css"),
  "utf-8",
);

function tokensIn(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1]] = m[2].toUpperCase();
  }
  return out;
}

function extractBlock(css: string, opener: RegExp): string {
  const start = css.search(opener);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return "";
}

const webLight = tokensIn(extractBlock(WEB_CSS, /@theme/));
const webDark = { ...webLight, ...tokensIn(extractBlock(WEB_CSS, /\.dark\s*\{/)) };
const landing = tokensIn(LANDING_CSS);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

function expectPair(tokens: Record<string, string>, fg: string, bg: string, min = 4.5) {
  expect(tokens[fg], `token --color-${fg} must be defined`).toBeDefined();
  expect(tokens[bg], `token --color-${bg} must be defined`).toBeDefined();
  const r = ratio(tokens[fg], tokens[bg]);
  expect(
    r,
    `--color-${fg} (${tokens[fg]}) on --color-${bg} (${tokens[bg]}) is ${r.toFixed(2)}:1, needs >= ${min}:1`,
  ).toBeGreaterThanOrEqual(min);
}

describe("web light theme", () => {
  it("defines the label tokens the app uses", () => {
    for (const t of [
      "primary-foreground",
      "destructive-foreground",
      "success-foreground",
      "accent-foreground",
    ]) {
      expect(
        webLight[t],
        `--color-${t} must be defined (undefined utilities render no CSS)`,
      ).toBeDefined();
    }
  });

  it("labels pass AA on their fills", () => {
    expectPair(webLight, "primary-foreground", "primary");
    expectPair(webLight, "primary-foreground", "primary-light");
    expectPair(webLight, "destructive-foreground", "destructive");
    expectPair(webLight, "success-foreground", "success");
    expectPair(webLight, "accent-foreground", "accent");
  });

  it("ink text passes AA on every light surface", () => {
    for (const bg of ["background", "card", "primary-subtle", "muted"]) {
      expectPair(webLight, "primary-ink", bg);
    }
    expectPair(webLight, "primary-ink-strong", "background");
    for (const bg of ["background", "card"]) {
      expectPair(webLight, "destructive-ink", bg);
      expectPair(webLight, "success-ink", bg);
    }
  });

  it("neutral text passes AA", () => {
    expectPair(webLight, "foreground", "background");
    expectPair(webLight, "muted-foreground", "background");
    expectPair(webLight, "muted-foreground", "card");
    expectPair(webLight, "muted-foreground", "muted");
    expectPair(webLight, "sidebar-foreground", "sidebar");
  });
});

describe("web dark theme", () => {
  it("labels still pass on fills (theme-static)", () => {
    expectPair(webDark, "primary-foreground", "primary");
    expectPair(webDark, "destructive-foreground", "destructive");
    expectPair(webDark, "success-foreground", "success");
  });

  it("ink text passes AA on dark surfaces", () => {
    for (const bg of ["background", "card"]) {
      expectPair(webDark, "primary-ink", bg);
      expectPair(webDark, "destructive-ink", bg);
      expectPair(webDark, "success-ink", bg);
      expectPair(webDark, "muted-foreground", bg);
    }
    expectPair(webDark, "foreground", "background");
  });
});

describe("focus ring (issue #568)", () => {
  it("ring meets 3:1 non-text contrast (WCAG 1.4.11) on light surfaces", () => {
    for (const bg of ["background", "card", "muted", "primary-subtle", "sidebar"]) {
      expectPair(webLight, "ring", bg, 3);
    }
  });

  it("ring meets 3:1 non-text contrast on dark surfaces", () => {
    for (const bg of ["background", "card", "muted", "sidebar"]) {
      expectPair(webDark, "ring", bg, 3);
    }
  });
});

describe("landing", () => {
  it("ink text passes AA on light surfaces", () => {
    for (const bg of ["background", "surface", "background-alt", "primary-subtle"]) {
      expectPair(landing, "primary-ink", bg);
    }
    expectPair(landing, "primary-ink-strong", "background");
  });

  it("CTA label passes on both gradient ends", () => {
    expectPair(landing, "foreground", "primary");
    expectPair(landing, "foreground", "primary-light");
  });

  it("semantic and muted text pass", () => {
    expectPair(landing, "success", "background");
    expectPair(landing, "muted", "background");
    expectPair(landing, "dark-fg", "dark-bg");
  });
});
