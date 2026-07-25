import { expect, test } from "@playwright/test";

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
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
    await expect(page.locator(INDICATOR)).toContainText("Checking status");
    // The state most visitors see first, so it needs pinning too. The dot was
    // once #A8A29A: 2.19:1 on the footer, under WCAG 1.4.11's 3:1 for non-text.
    // --color-muted is 4.97:1 and is a palette token rather than a magic hex.
    await expect(page.locator(DOT)).toHaveCSS("background-color", MUTED);
  });

  test("stays grey when the status route errors", async ({ page }) => {
    await page.route("**/api/status", (route) => route.fulfill({ status: 500, body: "" }));
    const settled = page.waitForResponse("**/api/status");
    await page.goto("/");
    await settled;
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
  });

  for (const [status, label, dotColor] of [
    ["operational", "All systems operational", "rgb(30, 123, 92)"],
    ["partial", "Partial outage", "rgb(168, 85, 24)"],
    ["down", "Service disruption", "rgb(190, 58, 53)"],
  ] as const) {
    test(`renders the ${status} state`, async ({ page }) => {
      await mockStatus(page, status);
      await page.goto("/");
      await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", status);
      await expect(page.locator(INDICATOR)).toContainText(label);
      // The dot is the only thing that carries state. Each color clears WCAG
      // 1.4.11's 3:1 non-text floor against the footer's --color-background-alt.
      await expect(page.locator(DOT)).toHaveCSS("background-color", dotColor);
      // And the label never carries it, in any state. --color-success is
      // 4.498:1 there, just under AA, so a colored label would fail
      // tests/unit/palette-contrast.test.ts. "down" is the tempting one to redden.
      await expect(page.locator(LABEL)).toHaveCSS("color", MUTED);
    });
  }

  test("ignores an unrecognized status value", async ({ page }) => {
    await mockStatus(page, "banana");
    const settled = page.waitForResponse("**/api/status");
    await page.goto("/");
    await settled;
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
  });

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

  test("sits in the footer, not the page body", async ({ page }) => {
    await mockStatus(page, "operational");
    await page.goto("/");
    await expect(page.locator(`footer ${INDICATOR}`)).toBeVisible();
  });
});
