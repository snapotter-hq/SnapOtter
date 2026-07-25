import { expect, test } from "@playwright/test";

/**
 * `astro dev` does not run _worker.js, so /api/status really is absent here.
 * Tests that need a verdict mock it; the ones that do not are exercising the
 * degraded path on purpose.
 */

const INDICATOR = "[data-status-indicator]";

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
  });

  test("stays grey when the status route errors", async ({ page }) => {
    await page.route("**/api/status", (route) => route.fulfill({ status: 500, body: "" }));
    const settled = page.waitForResponse("**/api/status");
    await page.goto("/");
    await settled;
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
  });

  for (const [status, label] of [
    ["operational", "All systems operational"],
    ["partial", "Partial outage"],
    ["down", "Service disruption"],
  ] as const) {
    test(`renders the ${status} state`, async ({ page }) => {
      await mockStatus(page, status);
      await page.goto("/");
      await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", status);
      await expect(page.locator(INDICATOR)).toContainText(label);
    });
  }

  test("ignores an unrecognized status value", async ({ page }) => {
    await mockStatus(page, "banana");
    const settled = page.waitForResponse("**/api/status");
    await page.goto("/");
    await settled;
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "checking");
  });

  test("keeps the label muted so it never fails AA", async ({ page }) => {
    await mockStatus(page, "operational");
    await page.goto("/");
    await expect(page.locator(INDICATOR)).toHaveAttribute("data-status", "operational");
    const color = await page
      .locator("[data-status-label]")
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe(MUTED);
  });

  test("sits in the footer, not the page body", async ({ page }) => {
    await mockStatus(page, "operational");
    await page.goto("/");
    await expect(page.locator(`footer ${INDICATOR}`)).toBeVisible();
  });
});
