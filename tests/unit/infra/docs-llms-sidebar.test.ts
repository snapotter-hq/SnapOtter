import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    expect(config).toContain('import { pageOnlySidebar } from "./llms-sidebar.mjs";');
    expect(config).toMatch(/llmstxt\(\{[\s\S]*?sidebar:\s*pageOnlySidebar,/);
  });
});
