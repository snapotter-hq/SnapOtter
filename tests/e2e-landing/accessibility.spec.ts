import { expect, test } from "@playwright/test";

test.describe("Heading Hierarchy", () => {
  const pages = [
    { path: "/", name: "Homepage" },
    { path: "/contact", name: "Contact" },
    { path: "/faq", name: "FAQ" },
    { path: "/privacy", name: "Privacy" },
    { path: "/terms", name: "Terms" },
  ];

  for (const { path, name } of pages) {
    test(`${name} page has exactly one h1`, async ({ page }) => {
      await page.goto(path);
      const h1Count = await page.locator("h1").count();
      expect(h1Count).toBe(1);
    });
  }
});

test.describe("External Links", () => {
  test("GitHub links open in new tab with noopener", async ({ page }) => {
    await page.goto("/");
    const ghLinks = page.locator('a[href*="github.com"]');
    const count = await ghLinks.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const link = ghLinks.nth(i);
      await expect(link).toHaveAttribute("target", "_blank");
      const rel = await link.getAttribute("rel");
      expect(rel).toContain("noopener");
    }
  });

  test("Docs link opens in new tab", async ({ page }) => {
    await page.goto("/");
    const docsLink = page.locator('a[href="https://docs.snapotter.com"]').first();
    await expect(docsLink).toHaveAttribute("target", "_blank");
  });
});

test.describe("Landmark Elements", () => {
  test("homepage has nav, main, and footer landmarks", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
  });
});

test.describe("Meta Tags", () => {
  test("homepage has meta description", async ({ page }) => {
    await page.goto("/");
    const metaDesc = page.locator('meta[name="description"]');
    const content = await metaDesc.getAttribute("content");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(10);
  });

  test("homepage has Open Graph tags", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /.+/,
    );
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      "content",
      /.+/,
    );
  });
});

test.describe("Keyboard Navigation", () => {
  test("Tab key moves focus through navbar links", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocused).toBe("A");
  });
});

test.describe("Image Accessibility", () => {
  test("navbar logo has alt text", async ({ page }) => {
    await page.goto("/");
    const logo = page.locator('nav img[alt="SnapOtter"]');
    await expect(logo).toBeVisible();
  });
});
