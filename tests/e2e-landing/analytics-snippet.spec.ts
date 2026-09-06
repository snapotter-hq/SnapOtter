// tests/e2e-landing/analytics-snippet.spec.ts
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * The landing harness builds with a placeholder PostHog key (see
 * playwright.landing.config.ts), so `dist` is the only automated place where
 * the whole chain is visible at once: the shared snippet module, the Astro
 * `set:html` on an inline script, and the head placement in Base.astro. The
 * unit tests cover each link on its own; this is the one that fails when a
 * refactor silently drops the analytics from every page, which is how the
 * previous beacon sat dark in production for months.
 */

const DIST = path.resolve(__dirname, "../../apps/landing/dist");
const INIT = 'posthog.init("phc_playwright_placeholder",';

function htmlFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, acc);
    else if (entry.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

test.describe("landing analytics snippet", () => {
  test("every page carries the PostHog snippet once, in the head, unescaped", () => {
    const pages = htmlFiles(DIST);
    expect(pages.length).toBeGreaterThan(100);

    const wrong: string[] = [];
    for (const file of pages) {
      const html = fs.readFileSync(file, "utf8");
      const headEnd = html.indexOf("</head>");
      const head = html.slice(0, headEnd);
      const body = html.slice(headEnd);
      const inHead = head.split(INIT).length - 1;
      const ok =
        inHead === 1 &&
        !body.includes(INIT) &&
        head.includes('"api_host":"http://127.0.0.1:1"') &&
        !head.includes("&quot;api_host&quot;");
      if (!ok) wrong.push(path.relative(DIST, file));
    }

    expect(
      wrong,
      `pages whose head does not carry exactly one unescaped posthog.init:\n  ${wrong.slice(0, 10).join("\n  ")}`,
    ).toEqual([]);
  });
});
