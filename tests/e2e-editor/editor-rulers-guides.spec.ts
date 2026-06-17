import { createNewDocument, expect, test } from "./helpers";

test.describe("Editor Rulers and Guides", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  test("rulers are hidden by default", async ({ editorPage: page }) => {
    // The ruler canvases render only when rulersVisible is true.
    // By default rulers are hidden, so the ruler-specific canvases
    // (with cursor-col-resize / cursor-row-resize) should not be present.
    const horizontalRuler = page.locator("canvas.cursor-col-resize");
    const verticalRuler = page.locator("canvas.cursor-row-resize");

    await expect(horizontalRuler).toHaveCount(0);
    await expect(verticalRuler).toHaveCount(0);
  });

  test("Ctrl+R toggles ruler visibility", async ({ editorPage: page }) => {
    // Initially hidden
    const horizontalRuler = page.locator("canvas.cursor-col-resize");
    await expect(horizontalRuler).toHaveCount(0);

    // Press Ctrl+R to show rulers
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(500);

    // Now they should appear
    await expect(page.locator("canvas.cursor-col-resize")).toBeVisible();
    await expect(page.locator("canvas.cursor-row-resize")).toBeVisible();

    // Press Ctrl+R again to hide
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(500);

    await expect(page.locator("canvas.cursor-col-resize")).toHaveCount(0);
    await expect(page.locator("canvas.cursor-row-resize")).toHaveCount(0);
  });

  test("horizontal ruler appears at top edge", async ({ editorPage: page }) => {
    // Enable rulers
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(500);

    const horizontalRuler = page.locator("canvas.cursor-col-resize");
    await expect(horizontalRuler).toBeVisible();

    // Ruler should have a fixed height of 20px (RULER_SIZE)
    const box = await horizontalRuler.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height).toBe(20);

    // Ruler should stretch to full width (w-full class)
    expect(box?.width).toBeGreaterThan(100);
  });

  test("vertical ruler appears at left edge", async ({ editorPage: page }) => {
    // Enable rulers
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(500);

    const verticalRuler = page.locator("canvas.cursor-row-resize");
    await expect(verticalRuler).toBeVisible();

    // Ruler should have a fixed width of 20px (RULER_SIZE)
    const box = await verticalRuler.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBe(20);

    // Ruler should stretch to fill the available height
    expect(box?.height).toBeGreaterThan(100);
  });

  test("rulers render a themed background, not solid black (issue #258)", async ({
    editorPage: page,
  }) => {
    // Canvas 2D `fillStyle` cannot read CSS `var(--...)` colors; the regression
    // left the default black fill in place and painted the rulers as solid
    // black bars. Verify both rulers paint a light (card) background instead.
    await page.keyboard.press("Control+r");
    await page.waitForTimeout(500);

    for (const selector of ["canvas.cursor-col-resize", "canvas.cursor-row-resize"]) {
      const ruler = page.locator(selector);
      await expect(ruler).toBeVisible();
      const pixel = await ruler.evaluate((cv: HTMLCanvasElement) => {
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        const d = ctx?.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
        return d ? [d[0], d[1], d[2], d[3]] : null;
      });
      expect(pixel).not.toBeNull();
      // Not the default-black fill the bug produced...
      expect(pixel).not.toEqual([0, 0, 0, 255]);
      // ...and unmistakably a light background (white card sums to 765).
      expect((pixel?.[0] ?? 0) + (pixel?.[1] ?? 0) + (pixel?.[2] ?? 0)).toBeGreaterThan(300);
    }
  });
});
