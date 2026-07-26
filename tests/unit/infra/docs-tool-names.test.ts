// @vitest-environment node
import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { TOOLS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

/**
 * PR #520 renamed 18 tools across the app and the tool pages, but the VitePress
 * sidebar kept its old labels for another two releases: 19 entries in the nav
 * under names the product no longer used. One page H1 was missed too.
 *
 * Tool leaves in the sidebar are deliberately never translated (see
 * localizeSidebar in apps/docs/.vitepress/config.mts), so checking the English
 * config covers all 21 locales.
 */

const ROOT = path.resolve(__dirname, "../../..");
const NAME_BY_ID = new Map(TOOLS.map((t) => [t.id, t.name]));

/**
 * Shipped tools with no docs page. Adding a page means deleting the id here.
 * Adding a tool without a page means this list grows, which is the point.
 */
const UNDOCUMENTED = new Set(["remove-gif-background", "rounded-crop"]);

interface Leaf {
  label: string;
  id: string;
  line: number;
}

function sidebarToolLeaves(): Leaf[] {
  const src = readFileSync(path.join(ROOT, "apps/docs/.vitepress/config.mts"), "utf8");
  const leaves: Leaf[] = [];
  src.split("\n").forEach((line, i) => {
    // The single top-nav entry sits at six spaces; sidebar leaves are deeper.
    if (!/^\s{10,}\{ text: "/.test(line)) return;
    const m = line.match(
      /\{ text: "([^"]+)", link: "\/tools\/(?:image|video|audio|pdf|files)\/([a-z0-9-]+)" \}/,
    );
    if (m) leaves.push({ label: m[1], id: m[2], line: i + 1 });
  });
  return leaves;
}

const LEAVES = sidebarToolLeaves();
const PAGES = globSync("apps/docs/tools/*/*.md", { cwd: ROOT })
  .filter((f) => !f.endsWith("conversion-presets.md"))
  .sort();

describe("docs sidebar", () => {
  it("found the tool leaves", () => {
    expect(LEAVES.length).toBeGreaterThan(100);
  });

  it("links only to tools the catalog ships", () => {
    expect(LEAVES.filter((l) => !NAME_BY_ID.has(l.id)).map((l) => l.id)).toEqual([]);
  });

  it("labels every leaf with the tool's catalog name", () => {
    const wrong = LEAVES.filter((l) => NAME_BY_ID.get(l.id) !== l.label).map(
      (l) => `config.mts:${l.line} "${l.label}" should be "${NAME_BY_ID.get(l.id)}"`,
    );
    expect(wrong).toEqual([]);
  });
});

describe("tool pages", () => {
  it("found the pages", () => {
    expect(PAGES.length).toBeGreaterThan(100);
  });

  it("titles every page with the tool's catalog name", () => {
    const wrong: string[] = [];
    for (const file of PAGES) {
      const id = path.basename(file, ".md");
      const name = NAME_BY_ID.get(id);
      if (!name) {
        wrong.push(`${file} has no tool with id ${id}`);
        continue;
      }
      const h1 = readFileSync(path.join(ROOT, file), "utf8")
        .split("\n")
        .find((l) => l.startsWith("# "))
        ?.replace(/^#\s+/, "")
        .replace(/\s*\{#.*\}$/, "")
        .trim();
      if (h1 !== name) wrong.push(`${file} H1 "${h1}" should be "${name}"`);
    }
    expect(wrong).toEqual([]);
  });

  it("tracks exactly the tools that still have no page", () => {
    const documented = new Set(PAGES.map((f) => path.basename(f, ".md")));
    const missing = TOOLS.filter((t) => !documented.has(t.id))
      .map((t) => t.id)
      // The 83 conversion presets are covered collectively by
      // apps/docs/tools/conversion-presets.md rather than one page each.
      .filter((id) => !id.includes("-to-"));
    expect(missing.sort()).toEqual([...UNDOCUMENTED].sort());
  });
});
