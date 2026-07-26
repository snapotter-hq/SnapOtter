import { expect, test } from "@playwright/test";

const SLUGS = [
  "image-compressor",
  "pdf-ocr",
  "video-converter",
  "background-removal",
  "transcription",
  "file-conversion-api",
  "metadata-removal",
];

test.describe("Self-hosted hub", () => {
  test("renders the hub heading and lists use-case cards", async ({ page }) => {
    const res = await page.goto("/self-hosted");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: "Self-hosted file processing" })).toBeVisible();
    await expect(page.locator('a[href^="/self-hosted/"]')).not.toHaveCount(0);
  });
});

test.describe("Self-hosted spokes", () => {
  for (const slug of SLUGS) {
    test(`/self-hosted/${slug} renders and sets a unique canonical`, async ({ page }) => {
      const res = await page.goto(`/self-hosted/${slug}`);
      expect(res?.status()).toBeLessThan(400);
      await expect(page.locator("main h1")).toBeVisible();

      // Both the slashed and un-slashed URL serve 200, so the canonical picks one.
      // Trailing slash, matching the emitted directory and every other page.
      const canonical = `https://snapotter.com/self-hosted/${slug}/`;
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonical);

      // Google only honours an hreflang self-reference that matches the canonical,
      // and these pages are English-only, so that pair is the whole alternate set.
      const alternates = await page
        .locator('link[rel="alternate"]')
        .evaluateAll((nodes) =>
          nodes.map((n) => [n.getAttribute("hreflang"), n.getAttribute("href")]),
        );
      expect(alternates).toEqual([
        ["en", canonical],
        ["x-default", canonical],
      ]);
    });
  }
});

test.describe("pdf-ocr spoke details", () => {
  test("emits FAQ JSON-LD and links to a real tool page", async ({ page }) => {
    await page.goto("/self-hosted/pdf-ocr");
    await expect(page.locator("main h1")).toContainText("Self-hosted PDF OCR");

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.some((t) => t.includes('"FAQPage"'))).toBe(true);

    const toolLink = page.locator('a[href="/tools/pdf/ocr-pdf"]').first();
    await expect(toolLink).toBeVisible();
    const toolRes = await page.request.get("/tools/pdf/ocr-pdf");
    expect(toolRes.status()).toBeLessThan(400);
  });
});
