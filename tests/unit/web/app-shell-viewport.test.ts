import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for the mobile "can't reach the Process button" bug.
 *
 * The full-height, overflow-hidden app shells must size to the *dynamic* viewport
 * (`h-dvh` / 100dvh), never `h-screen` (100vh). On mobile browsers 100vh is the
 * tall viewport measured with the URL bar retracted, so a 100vh shell with
 * `overflow: hidden` pushes its bottom strip (the fixed bottom nav and the in-flow
 * tool "Process" peek bar) below the visible area with no way to scroll to it.
 * `dvh` tracks the actual visible viewport, keeping those controls reachable.
 *
 * This can't be caught by a behavioral e2e test: headless Chromium has no dynamic
 * URL bar, so `100vh === visible height` there and the bug never reproduces. A
 * source-level guard is the only thing that stops a well-meaning "cleanup" from
 * reverting `h-dvh` to `h-screen`.
 */
const SHELL = "flex flex-col h-dvh";
const BROKEN = "flex flex-col h-screen";

const SHELLS = {
  "app-layout.tsx": "../../../apps/web/src/components/layout/app-layout.tsx",
  "editor-page.tsx": "../../../apps/web/src/pages/editor-page.tsx",
} as const;

describe("full-height app shells use the dynamic viewport unit", () => {
  for (const [name, rel] of Object.entries(SHELLS)) {
    const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

    it(`${name} sizes the shell with h-dvh`, () => {
      expect(src).toContain(SHELL);
    });

    it(`${name} does not use h-screen for the shell`, () => {
      expect(src).not.toContain(BROKEN);
    });
  }
});
