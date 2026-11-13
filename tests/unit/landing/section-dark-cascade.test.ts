import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// #4297: Tailwind v4 emits utilities inside `@layer utilities`, and an unlayered rule
// beats any layered one whatever the specificity. A bare `.section-dark span { color }`
// therefore overrode `text-primary-light` and `text-dark-fg` on spans in the dark bands.
const CSS = fs
  .readFileSync(path.resolve(__dirname, "../../../apps/landing/src/styles/globals.css"), "utf-8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** The at-rule prelude chain that encloses the character at `index`. */
function enclosingAtRules(css: string, index: number): string[] {
  const stack: string[] = [];
  let preludeStart = 0;
  for (let i = 0; i < index; i++) {
    if (css[i] === "{") {
      stack.push(css.slice(preludeStart, i).trim());
      preludeStart = i + 1;
    } else if (css[i] === "}") {
      stack.pop();
      preludeStart = i + 1;
    } else if (css[i] === ";") {
      preludeStart = i + 1;
    }
  }
  return stack.filter((prelude) => prelude.startsWith("@"));
}

describe("landing .section-dark text colour cascade", () => {
  it("keeps the p/span default colour in a cascade layer so text utilities win", () => {
    const at = CSS.indexOf(".section-dark p");
    expect(at, ".section-dark p rule exists").toBeGreaterThan(-1);
    expect(enclosingAtRules(CSS, at)).toContain("@layer base");
  });
});
