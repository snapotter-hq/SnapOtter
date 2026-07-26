import { expect, test } from "@playwright/test";
import de from "../../apps/landing/src/i18n/de.json";

/**
 * `astro dev` does not run _worker.js, so /api/status really is absent here.
 * Tests that need a verdict mock it; the ones that do not are exercising the
 * degraded path on purpose.
 */

const INDICATOR = "[data-status-indicator]";
const DOT = "[data-status-dot]";
const LABEL = "[data-status-label]";

/** --color-muted #6B6560. The label must never take a state color (AA: success is 4.498:1). */
const MUTED = "rgb(107, 101, 96)";

function mockStatus(page: import("@playwright/test").Page, status: string) {
  return page.route("**/api/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status }),
    }),
  );
}

/**
 * `waitForResponse` resolves when Playwright sees the response over CDP, which
 * is ahead of the page's own `.then` chain. Two frames give the badge its
 * chance to change, so a "stays grey" assertion proves it did not rather than
 * just winning a race.
 */
function flushFrames(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

test.describe("Footer status indicator", () => {
  test("ships the grey state in the served HTML, before any script runs", async ({ page }) => {
    // Fetched as raw markup rather than a rendered page, so this covers the
    // no-JavaScript reader too. The badge must never be baked green.
    const res = await page.request.get("/");
    const html = await res.text();
    expect(html).toContain('data-status="checking"');
    expect(html).toMatch(/<span data-status-label[^>]*>Checking status<\/span>/);
    // Scoped to the badge's own rendered text rather than the whole document.
    // The three verdict strings do appear further down, inside the script's
    // label table, because the client has to localize whatever /api/status
    // reports. What must never happen is the markup claiming a verdict.
    for (const verdict of ["All systems operational", "Partial outage", "Service disruption"]) {
      expect(html).not.toMatch(new RegExp(`<span data-status-label[^>]*>${verdict}</span>`));
    }
  });

  test("stays grey when the status route is unavailable", async ({ page }) => {
    const settled = page.waitForResponse("**/api/status");
    await page.goto("/");
    await settled;
    await flushFrames(page);
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
    await expect(page.locator(INDICATOR)).toContainText("Checking status");
    // The state most visitors see first, so it needs pinning too. The dot was
    // once #A8A29A: 2.19:1 on the footer, under WCAG 1.4.11's 3:1 for non-text.
    // --color-muted is 4.97:1 and is a palette token rather than a magic hex.
    await expect(page.locator(DOT)).toHaveCSS("background-color", MUTED);
  });

  // The body is parseable and claims green on purpose. With an empty body the
  // badge stays grey because res.json() rejects, so `res.ok` is never exercised
  // and deleting it passes. A 5xx carrying a verdict is the realistic case: a
  // Cloudflare error envelope, or a stale cached body served on a 502.
  test("stays grey when the status route errors, even with a parseable body", async ({ page }) => {
    await page.route("**/api/status", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ status: "operational" }),
      }),
    );
    const settled = page.waitForResponse("**/api/status");
    await page.goto("/");
    await settled;
    await flushFrames(page);
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
    await expect(page.locator(INDICATOR)).toContainText("Checking status");
  });

  // Reaches the .catch through a rejected fetch rather than a bad response.
  test("stays grey when the request itself fails", async ({ page }) => {
    await page.route("**/api/status", (route) => route.abort("failed"));
    await page.goto("/");
    await flushFrames(page);
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
    await expect(page.locator(INDICATOR)).toContainText("Checking status");
  });

  // Reaches the .catch through res.json() instead. This is the broken-deploy
  // signature: _worker.js fails to load, or a _redirects rule shadows the
  // route, and the client gets a 200 carrying HTML.
  test("stays grey when a 200 carries HTML instead of JSON", async ({ page }) => {
    await page.route("**/api/status", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>404</title>",
      }),
    );
    const settled = page.waitForResponse("**/api/status");
    await page.goto("/");
    await settled;
    await flushFrames(page);
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
    await expect(page.locator(INDICATOR)).toContainText("Checking status");
  });

  for (const [status, label, dotColor] of [
    ["operational", "All systems operational", "rgb(30, 123, 92)"],
    ["partial", "Partial outage", "rgb(168, 85, 24)"],
    ["down", "Service disruption", "rgb(190, 58, 53)"],
  ] as const) {
    test(`renders the ${status} state`, async ({ page }) => {
      await mockStatus(page, status);
      await page.goto("/");
      // Scoped to the footer, which is where the badge belongs. This subsumes
      // the standalone placement test that used to sit at the bottom of the
      // file and never observed its own mock.
      const badge = page.locator(`footer ${INDICATOR}`);
      await expect(badge).toHaveAttribute("data-status", status);
      await expect(badge).toContainText(label);
      // The dot is the only thing that carries state. Each color clears WCAG
      // 1.4.11's 3:1 non-text floor against the footer's --color-background-alt,
      // pinned as a ratio in tests/unit/palette-contrast.test.ts.
      await expect(badge.locator(DOT)).toHaveCSS("background-color", dotColor);
      // And the label never carries it, in any state. --color-success is
      // 4.498:1 on the footer's --color-background-alt, just under AA.
      // palette-contrast.test.ts pins the dot ratios but cannot answer a
      // cascade question like "does the label take a state color", so this
      // assertion is the only guard. "down" is the tempting one to redden.
      await expect(badge.locator(LABEL)).toHaveCSS("color", MUTED);
    });
  }

  // "banana" is absent for the easy reason. "toString" is the one that matters:
  // it resolves on Object.prototype, so an unguarded lookup renders
  // "function toString() { [native code] }" in the footer.
  for (const status of ["banana", "toString"] as const) {
    test(`ignores the unrecognized status "${status}"`, async ({ page }) => {
      await mockStatus(page, status);
      const settled = page.waitForResponse("**/api/status");
      await page.goto("/");
      await settled;
      await flushFrames(page);
      await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
      await expect(page.locator(INDICATOR)).toContainText("Checking status");
    });
  }

  test("names the three services it speaks for", async ({ page }) => {
    // The badge reports on snapotter.com's own properties, never on a visitor's
    // self-hosted instance. The title is the only thing that says which.
    await page.goto("/");
    const title = await page.locator(INDICATOR).getAttribute("title");
    // Compared as whole entries, not substrings: "snapotter.com" is a suffix of
    // the other two, so toContain would pass on a title missing the apex.
    const hosts = new Set(title?.split(",").map((host) => host.trim()));
    expect(hosts).toEqual(new Set(["snapotter.com", "demo.snapotter.com", "docs.snapotter.com"]));
  });

  test("keeps the decorative dot out of the accessible name", async ({ page }) => {
    // Without aria-hidden the empty span joins the badge's accessible name.
    await page.goto("/");
    await expect(page.locator(DOT)).toHaveAttribute("aria-hidden", "true");
  });

  test("localizes the badge on a locale-prefixed page", async ({ page }) => {
    // Raw markup, no browser: this is about what the server renders for a
    // localized tree. Without it, dropping the locale prop from <StatusIndicator />
    // in Footer.astro serves English on all 20 and every other test still passes.
    const html = await (await page.request.get("/de/")).text();
    const checking = de["footer.status.checking"];
    // Makes the assertion below mean something: it fails loudly if de.json ever
    // falls back to the English string rather than silently comparing "" to "".
    expect(checking).not.toBe("Checking status");
    expect(html).toContain(`>${checking}</span>`);
    // The inline script's label table has to be German too, not just the
    // server-rendered default the reader sees first.
    expect(html).toContain(JSON.stringify(de["footer.status.operational"]));
  });
});
