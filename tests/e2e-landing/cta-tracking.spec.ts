import { expect, type Page, test } from "@playwright/test";

/**
 * Named CTA events (#5010). The build carries a placeholder PostHog key, so a
 * real snippet would try to load the SDK from an unroutable host. Each test
 * swaps in a recording stub instead and sets the snippet's own once-guard, so
 * the inline loader never runs. Link default actions are cancelled in the
 * bubble phase, after the tracker's capture-phase listener has fired, so the
 * page stays put and nothing reaches docs.snapotter.com or the demo.
 */

type Capture = [event: string, props: Record<string, string>];

async function stubPostHog(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const calls: unknown[] = [];
    w.__ctaCalls = calls;
    w.__snapotterAnalytics = 1;
    w.posthog = {
      __SV: 1,
      init() {},
      capture: (...args: unknown[]) => calls.push(args),
    };
    document.addEventListener("click", (e) => {
      if ((e.target as Element | null)?.closest?.("a")) e.preventDefault();
    });
  });
}

async function captures(page: Page): Promise<Capture[]> {
  return page.evaluate(() => (window as unknown as { __ctaCalls: Capture[] }).__ctaCalls);
}

test.describe("landing CTA events", () => {
  test.beforeEach(async ({ page }) => {
    await stubPostHog(page);
  });

  test("hero Docker copy, live demo and a category card each send one event", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.locator("#hero-docker-copy").click();
    await page.locator('a[data-cta="live-demo"][data-cta-location="hero"]').click();
    await page.locator('a[data-cta="category-card"][data-cta-detail="pdf"]').click();

    await expect
      .poll(() => captures(page))
      .toEqual([
        ["landing_cta_clicked", { cta: "docker-copy", location: "hero", locale: "en" }],
        [
          "landing_cta_clicked",
          {
            cta: "live-demo",
            location: "hero",
            href: "https://demo.snapotter.com",
            locale: "en",
          },
        ],
        [
          "landing_cta_clicked",
          {
            cta: "category-card",
            location: "hero",
            detail: "pdf",
            href: "/tools/pdf/",
            locale: "en",
          },
        ],
      ]);
  });

  test("navbar Install is told apart from the pricing one", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.locator('a[data-cta="install"][data-cta-location="nav"]').click();
    await page.locator('a[data-cta="install"][data-cta-location="pricing"]').click();

    const sent = await captures(page);
    expect(sent.map(([, p]) => `${p.cta}@${p.location}`)).toEqual([
      "install@nav",
      "install@pricing",
    ]);
  });

  test("phone: the sticky bar and the mobile menu report their own location", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    await page.locator('a[data-cta="install"][data-cta-location="sticky-mobile"]').click();
    await page.getByLabel("Toggle menu").click();
    await page.locator('a[data-cta="install"][data-cta-location="nav-mobile"]').click();

    const sent = await captures(page);
    expect(sent.map(([, p]) => `${p.cta}@${p.location}`)).toEqual([
      "install@sticky-mobile",
      "install@nav-mobile",
    ]);
  });

  test("a middle-click on a CTA link counts too", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page
      .locator('a[data-cta="install"][data-cta-location="nav"]')
      .dispatchEvent("auxclick", { button: 1 });

    const sent = await captures(page);
    expect(sent.map(([, p]) => `${p.cta}@${p.location}`)).toEqual(["install@nav"]);
  });

  test("a click outside any CTA sends nothing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await page.locator("h1").first().click();

    expect(await captures(page)).toEqual([]);
  });
});

test("without PostHog on the page, CTA clicks don't throw", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.addInitScript(() => {
    // Stand in for a fork build: no key, so no snippet and no window.posthog.
    (window as unknown as Record<string, unknown>).__snapotterAnalytics = 1;
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  await page.locator("#hero-docker-copy").click();
  await expect(page.locator("#hero-docker-copy")).toHaveClass(/copied/);

  expect(errors).toEqual([]);
});
