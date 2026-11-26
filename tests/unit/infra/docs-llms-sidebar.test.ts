import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const helperPath = resolve(root, "apps/docs/.vitepress/llms-sidebar.mjs");
const config = readFileSync(resolve(root, "apps/docs/.vitepress/config.mts"), "utf8");

async function loadHelper() {
  return import(pathToFileURL(helperPath).href).catch(() => undefined);
}

describe("VitePress LLM sidebar", () => {
  it("removes section-only links without mutating the visible sidebar", async () => {
    const helper = await loadHelper();
    expect(helper, "the LLM sidebar adapter must exist").toBeDefined();
    if (!helper) return;

    const sidebar = [
      {
        text: "Guide",
        items: [
          { text: "Deployment", link: "/guide/deployment" },
          {
            text: "Hardware requirements",
            link: "/guide/deployment#hardware-requirements",
          },
          {
            text: "Nested",
            items: [{ text: "Quick reference", link: "/guide/deployment#quick-reference" }],
          },
        ],
      },
    ];

    expect(helper.pageOnlySidebar(sidebar)).toEqual([
      {
        text: "Guide",
        items: [
          { text: "Deployment", link: "/guide/deployment" },
          { text: "Nested", items: [] },
        ],
      },
    ]);
    expect(sidebar[0].items).toHaveLength(3);
  });

  it("keeps the UI deep link while adapting only the llmstxt plugin sidebar", () => {
    expect(config).toContain(
      '{ text: "Hardware requirements", link: "/guide/deployment#hardware-requirements" }',
    );
    expect(config).toMatch(/llmstxt\(\{[\s\S]*?sidebar:\s*llmsSidebar,/);
  });
});

// #5009: llms.txt was 768 KB (every page in 21 locales) with 3,843 `{#id}`
// leaks in its link titles; llms-full.txt was 18 MB.
describe("llms.txt and llms-full.txt contents", () => {
  it("drops tool links from the llms.txt table of contents but keeps guides", async () => {
    const helper = await loadHelper();
    const sidebar = {
      "/": [
        { text: "Guide", items: [{ text: "Deployment", link: "/guide/deployment" }] },
        {
          text: "Image",
          items: [
            { text: "Resize", link: "/tools/image/resize" },
            { text: "Deep", items: [{ text: "Crop", link: "/tools/image/crop" }] },
          ],
        },
      ],
    };
    expect(helper.llmsSidebar(sidebar)).toEqual({
      "/": [
        { text: "Guide", items: [{ text: "Deployment", link: "/guide/deployment" }] },
        { text: "Image", items: [{ text: "Deep", items: [] }] },
      ],
    });
    expect(sidebar["/"][1].items).toHaveLength(2);
  });

  it("keeps translations out of both files and tool pages out of the index", async () => {
    const helper = await loadHelper();
    const { llmsTxt, llmsFullTxt } = helper.llmsIgnorePatterns(["de", "zh-CN"]);
    for (const patterns of [llmsTxt, llmsFullTxt]) {
      expect(patterns).toEqual(expect.arrayContaining(["de/**", "de.md", "zh-CN/**", "zh-CN.md"]));
    }
    expect(llmsTxt).toContain("tools/**");
    expect(llmsFullTxt).not.toContain("tools/**");
    expect(config).toMatch(
      /ignoreFilesPerOutput:\s*llmsIgnorePatterns\(NON_EN\.map\(\(l\) => l\.code\)\)/,
    );
  });

  // #5261: ignoreFilesPerOutput only filters what each output lists. The plugin
  // still collected all 21 locales in memory and wrote a .md copy of each, which
  // pushed `vitepress build` past a 4 GB heap. Top-level ignoreFiles skips them
  // before they are collected.
  it("skips the translated trees before the plugin collects them", async () => {
    const helper = await loadHelper();
    expect(helper.llmsIgnoreFiles(["de", "zh-CN"])).toEqual(["de/**", "zh-CN/**"]);
    expect(config).toMatch(/ignoreFiles:\s*llmsIgnoreFiles\(NON_EN\.map\(\(l\) => l\.code\)\)/);
  });

  it("gives the docs build 6 GB of heap in CI and in the deploy", () => {
    const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
    const e2eDocs = ci.slice(ci.indexOf("  test-e2e-docs:"));
    expect(e2eDocs.slice(0, e2eDocs.indexOf("    steps:"))).toContain(
      "NODE_OPTIONS: --max-old-space-size=6144",
    );
    const deploy = readFileSync(resolve(root, ".github/workflows/deploy-docs.yml"), "utf8");
    expect(deploy).toContain("NODE_OPTIONS: --max-old-space-size=6144");
  });

  it("strips explicit heading ids from titles and headings only", async () => {
    const helper = await loadHelper();
    const input = [
      "- [Getting Started {#getting-started}](https://docs.snapotter.com/guide/getting-started.md): Install",
      "## Quick Start {#quick-start}",
      '### 401 "Bearer token required" {#\\_401-bearer-token-required}',
      "See [the stack](#docker-compose) and `{#not-a-heading}` inline.",
      "```md\n## Kept {#kept} trailing\n```",
    ].join("\n");
    expect(helper.stripHeadingIds(input)).toBe(
      [
        "- [Getting Started](https://docs.snapotter.com/guide/getting-started.md): Install",
        "## Quick Start",
        '### 401 "Bearer token required"',
        "See [the stack](#docker-compose) and `{#not-a-heading}` inline.",
        "```md\n## Kept {#kept} trailing\n```",
      ].join("\n"),
    );
  });

  it("rewrites the plugin's .md and llms*.txt outputs and nothing else", async () => {
    const helper = await loadHelper();
    const dir = mkdtempSync(join(tmpdir(), "llms-out-"));
    try {
      mkdirSync(join(dir, "guide"));
      const leak = "# Title {#title}\n";
      writeFileSync(join(dir, "llms.txt"), "- [A {#a}](x.md)\n");
      writeFileSync(join(dir, "llms-full.txt"), leak);
      writeFileSync(join(dir, "guide", "page.md"), leak);
      writeFileSync(join(dir, "robots.txt"), leak);
      writeFileSync(join(dir, "page.html"), leak);
      await helper.stripHeadingIdsFromLlmsOutputs(dir);
      expect(readFileSync(join(dir, "llms.txt"), "utf8")).toBe("- [A](x.md)\n");
      expect(readFileSync(join(dir, "llms-full.txt"), "utf8")).toBe("# Title\n");
      expect(readFileSync(join(dir, "guide", "page.md"), "utf8")).toBe("# Title\n");
      expect(readFileSync(join(dir, "robots.txt"), "utf8")).toBe(leak);
      expect(readFileSync(join(dir, "page.html"), "utf8")).toBe(leak);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs that cleanup after every docs build", () => {
    expect(config).toMatch(
      /async buildEnd\(siteConfig\) \{\s*await stripHeadingIdsFromLlmsOutputs\(siteConfig\.outDir\);/,
    );
  });
});
