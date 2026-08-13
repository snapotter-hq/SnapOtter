import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Touch devices have no hover, so a control styled `opacity-0` +
 * `group-hover:opacity-100` simply does not exist for them (#172). Every
 * hover reveal must carry a coarse-pointer escape (`pointer-coarse:opacity-100`,
 * always visible on touch) or a focus escape (`group-focus-within:opacity-100`,
 * reachable via tap-to-focus/keyboard). Same spirit as app-shell-viewport.test.ts:
 * a source-level guard for a class of bug that headless desktop e2e cannot see.
 */
const ROOT = fileURLToPath(new URL("../../../apps/web/src", import.meta.url));

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith(".tsx")) yield full;
  }
}

// The reveal idiom comes in two shapes: opacity (`opacity-0` +
// `group-hover:opacity-100`) and display (`hidden`/`invisible` +
// `group-hover:block|flex|...`). Both need an escape.
const DISPLAY_VALUES = "(?:block|flex|inline-flex|inline-grid|inline|grid|table|visible)";
const HIDDEN_TOKEN = /(?:^|[\s"'`{])(?:hidden|invisible)(?:[\s"'`}]|$)/;
const HOVER_DISPLAY = new RegExp(`group-hover:${DISPLAY_VALUES}`);
const ESCAPES = new RegExp(
  `(?:pointer-coarse|group-focus-within):(?:opacity-100|${DISPLAY_VALUES})`,
);

function isHoverOnlyReveal(line: string): boolean {
  const opacityReveal = line.includes("opacity-0") && line.includes("group-hover:opacity-100");
  const displayReveal = HIDDEN_TOKEN.test(line) && HOVER_DISPLAY.test(line);
  return (opacityReveal || displayReveal) && !ESCAPES.test(line);
}

describe("hover-revealed controls stay reachable on touch", () => {
  it("every group-hover reveal has a coarse-pointer or focus escape", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of walk(ROOT)) {
      scanned++;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (isHoverOnlyReveal(line)) offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
      });
    }
    // A relocated source tree must fail loudly, not pass on an empty walk.
    expect(scanned).toBeGreaterThan(200);
    expect(
      offenders,
      `hover-only reveals without a touch escape:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
