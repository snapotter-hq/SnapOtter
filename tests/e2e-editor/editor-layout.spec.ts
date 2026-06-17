import { createNewDocument, expect, test } from "./helpers";

// Regression coverage for issue #258: the editor canvas collapsed to the
// Stage's content height (leaving a large dead region), and the right panel
// was a fixed, non-resizable width.
test.describe("Editor layout (issue #258)", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  test("canvas viewport fills the full available editor area", async ({ editorPage: page }) => {
    const result = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="editor-canvas"]');
      const parent = container?.parentElement;
      if (!container || !parent) return null;
      const c = container.getBoundingClientRect();
      const p = parent.getBoundingClientRect();
      return {
        containerH: Math.round(c.height),
        parentH: Math.round(p.height),
        containerW: Math.round(c.width),
        parentW: Math.round(p.width),
      };
    });

    expect(result).not.toBeNull();
    // The canvas container must fill its parent in both dimensions; before the
    // fix it collapsed to ~600px tall, leaving an inert region below.
    expect(result?.containerH).toBe(result?.parentH);
    expect(result?.containerW).toBe(result?.parentW);
    expect(result?.containerH ?? 0).toBeGreaterThan(300);
  });

  test("right panel can be resized with the drag handle", async ({ editorPage: page }) => {
    const handle = page.locator('[data-testid="right-panel-resize-handle"]');
    await expect(handle).toBeVisible();

    const panel = handle.locator(".."); // the panel is the handle's parent
    const before = (await panel.boundingBox())?.width ?? 0;
    expect(before).toBeGreaterThan(0);

    const box = await handle.boundingBox();
    if (!box) throw new Error("resize handle has no bounding box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Drag left: the panel is anchored to the right edge, so it widens.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 100, cy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = (await panel.boundingBox())?.width ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});
