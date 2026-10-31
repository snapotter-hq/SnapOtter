import { expect, test } from "@playwright/test";

test.describe("search-miss tool request", () => {
  test("offers a request when a search finds nothing", async ({ page }) => {
    await page.goto("/");

    const searchInput = page.locator("[data-search-input]");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzxqwv nonexistent capability");

    const request = page.getByTestId("request-tool").first();
    await expect(request).toBeVisible();

    const href = await request.getAttribute("href");
    if (href) {
      expect(href).toContain("/discussions/new");
      expect(href).toContain("category=ideas");
    } else {
      await request.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Request a tool");
    }
  });

  test("opens the in-app request dialog when analytics is enabled", async ({ page }) => {
    // Force the client to see analytics as enabled so the affordance renders as an
    // in-app dialog trigger instead of a Discussions link. Merge with the real
    // config response so unrelated fields stay intact.
    await page.route("**/api/v1/config/analytics", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      // A PostHog key too: the in-app request is only offered where it can be
      // recorded (#2220). The host is a closed local port, so the client SDK's
      // requests go nowhere.
      await route.fulfill({
        json: {
          ...body,
          enabled: true,
          posthogApiKey: "phc_e2e",
          posthogHost: "http://127.0.0.1:9",
          feedbackSink: true,
        },
      });
    });

    await page.goto("/");

    const searchInput = page.locator("[data-search-input]");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzxqwv nonexistent capability");

    const request = page.getByTestId("request-tool").first();
    await expect(request).toBeVisible();
    // With analytics "on" the affordance is a button (no href) that opens the dialog.
    await expect(request).not.toHaveAttribute("href", /.+/);
    await request.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Request a tool");
    await expect(dialog).toContainText("zzxqwv nonexistent capability");
  });

  test("falls back to Discussions when a baked key has no feedback sink (#2252)", async ({
    page,
  }) => {
    await page.route("**/api/v1/config/analytics", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      // A key is baked, but the server has no PostHog client to take the
      // answer, so the in-app dialog would decline it. The affordance must
      // stay the Discussions link.
      await route.fulfill({
        json: {
          ...body,
          enabled: true,
          posthogApiKey: "phc_e2e",
          feedbackSink: false,
          posthogHost: "http://127.0.0.1:9",
        },
      });
    });

    // Wait for the mocked config to land: the Discussions link is also the
    // pre-config fallback, so asserting it before the fetch would prove
    // nothing about the gate.
    const configLoaded = page.waitForResponse("**/api/v1/config/analytics");
    await page.goto("/");
    await configLoaded;

    const searchInput = page.locator("[data-search-input]");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("zzxqwv nonexistent capability");

    const request = page.getByTestId("request-tool").first();
    await expect(request).toBeVisible();
    await expect(request).toHaveAttribute("href", /\/discussions\/new/);
  });
});
