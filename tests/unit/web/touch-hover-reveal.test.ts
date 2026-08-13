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

describe("hover-revealed controls stay reachable on touch", () => {
  it("every opacity-0 group-hover reveal has a coarse-pointer or focus escape", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("opacity-0") || !line.includes("group-hover:opacity-100")) return;
        if (line.includes("pointer-coarse:opacity-100")) return;
        if (line.includes("group-focus-within:opacity-100")) return;
        offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
      });
    }
    expect(
      offenders,
      `hover-only reveals without a touch escape:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
