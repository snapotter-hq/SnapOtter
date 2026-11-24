// tests/e2e-landing/tool-content.spec.ts
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { TOOLS, toolSection } from "@snapotter/shared";
import { formatBytes, TOOL_CONTENT } from "../../apps/landing/src/data/tool-content";

/**
 * First-hand tool content (#4911): the measured "What you actually get" section
 * appears on the tool pages that have content and nowhere else. The full sweep
 * reads `dist` directly, like index-policy.spec.ts; one page is also checked in
 * the browser so the section is known to render, not just to exist in the HTML.
 */

const DIST = path.resolve(__dirname, "../../apps/landing/dist");
const MARKER = 'data-testid="tool-first-hand"';
const toolPath = (t: (typeof TOOLS)[number]) => `/tools/${toolSection(t)}/${t.id}/`;

function readPage(urlPath: string): string {
  return fs.readFileSync(path.join(DIST, urlPath, "index.html"), "utf8");
}

test.describe("First-hand tool content", () => {
  test("renders the section on every tool page with content, and on no other", () => {
    for (const tool of TOOLS) {
      const html = readPage(toolPath(tool));
      expect(html.includes(MARKER), tool.id).toBe(tool.id in TOOL_CONTENT);
    }
  });

  test("prints each run's measured sizes", () => {
    for (const content of Object.values(TOOL_CONTENT)) {
      const tool = TOOLS.find((t) => t.id === content.toolId);
      if (!tool) throw new Error(`unknown tool ${content.toolId}`);
      const html = readPage(toolPath(tool));
      for (const run of content.runs) {
        expect(html, content.toolId).toContain(formatBytes(run.inputBytes));
        expect(html, content.toolId).toContain(formatBytes(run.outputBytes));
      }
    }
  });

  test("shows the measured results above Features on the Compress PDF page", async ({ page }) => {
    await page.goto("/tools/pdf/compress-pdf/");
    const section = page.getByTestId("tool-first-hand");
    await expect(section.getByRole("heading", { name: "What you actually get" })).toBeVisible();
    await expect(section.getByText("11.6 MB to 6.8 MB")).toBeVisible();
    await expect(section.getByRole("link", { name: "iLovePDF pricing" })).toHaveAttribute(
      "href",
      "https://www.ilovepdf.com/pricing",
    );

    const resultsTop = await section.evaluate((el) => el.getBoundingClientRect().top);
    const featuresTop = await page
      .getByRole("heading", { name: "Features", exact: true })
      .evaluate((el) => el.getBoundingClientRect().top);
    expect(resultsTop).toBeLessThan(featuresTop);
  });

  test("leaves a tool page without content unchanged", async ({ page }) => {
    await page.goto("/tools/image/crop/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("tool-first-hand")).toHaveCount(0);
  });
});
