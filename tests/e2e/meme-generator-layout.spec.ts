import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 390, height: 664 }, // iPhone viewport
});

test("meme generator top text is reachable on a phone", async ({ page }) => {
  await page.goto("/image/meme-generator");

  // Upload a tiny custom image
  await page.setInputFiles('input[type="file"]', {
    name: "test.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAGBAQABPxA=",
      "base64",
    ),
  });

  // Wait for the preview container
  const preview = page.getByTestId("meme-editor-preview");
  await expect(preview).toBeVisible();

  // Wait for image to load to get accurate dimensions
  await page.waitForSelector('[data-testid="meme-editor-preview"] img');

  const scrollerBox = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="meme-editor-preview"]')?.parentElement
      ?.parentElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  });

  expect(scrollerBox).not.toBeNull();

  // Try to scroll to the top
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="meme-editor-preview"]')?.parentElement
      ?.parentElement;
    if (el) el.scrollTop = 0;
  });

  // Re-measure after scroll
  const newPreviewBox = await preview.boundingBox();

  // If the top of the preview box is ABOVE the top of the scroller, and we are scrolled to 0,
  // it means the top content is unreachable!
  expect(newPreviewBox!.y).toBeGreaterThanOrEqual(scrollerBox!.top);
});
