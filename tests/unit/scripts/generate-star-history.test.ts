import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { escapeXml } from "../../../scripts/lib/xml-escape.mjs";

const scriptSource = readFileSync(
  path.resolve(process.cwd(), "scripts/generate-star-history.mjs"),
  "utf8",
);

describe("escapeXml", () => {
  it("escapes every character that can break out of an SVG attribute or text node", () => {
    expect(escapeXml(`owner/repo" onload="x`)).toBe("owner/repo&quot; onload=&quot;x");
    expect(escapeXml("it's <b>&</b>")).toBe("it&#39;s &lt;b&gt;&amp;&lt;/b&gt;");
  });

  it("leaves the default repository name untouched", () => {
    expect(escapeXml("snapotter-hq/SnapOtter")).toBe("snapotter-hq/SnapOtter");
  });
});

describe("generate-star-history", () => {
  // REPO comes from the environment and lands in an attribute, the one place
  // CodeQL js/incomplete-html-attribute-sanitization watches in this script.
  it("routes the repository name through escapeXml in the aria-label", () => {
    expect(scriptSource).toContain('import { escapeXml } from "./lib/xml-escape.mjs"');
    expect(scriptSource).toMatch(/aria-label="Star history for \$\{escapeXml\(REPO\)\}/);
  });
});
