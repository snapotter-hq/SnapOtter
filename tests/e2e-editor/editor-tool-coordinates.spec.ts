import { expect, loadTestImage, test } from "./helpers";

// Regression coverage for issue #259: editor pixel tools captured the document
// *through* the stage's zoom/pan transform (`stage.toCanvas`), so they read and
// wrote the wrong pixels — the paint bucket produced a misplaced rectangle
// instead of flood-filling the clicked region, the eyedropper sampled the wrong
// colour, etc. The shared `captureDocumentCanvas` helper now normalizes the
// transform before capturing.
test.describe("Editor tool coordinates (issue #259)", () => {
  test("paint bucket fills at the clicked location, not a misplaced rectangle", async ({
    editorPage: page,
  }) => {
    await loadTestImage(page);
    await page.waitForTimeout(500);

    await page.locator('[data-tool="fill"]').click();
    await page.waitForTimeout(200);

    // The first canvas inside the editor is the main content layer.
    const canvas = page.locator('[data-testid="editor-canvas"] canvas').first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("editor canvas has no bounding box");

    const clickX = box.x + box.width / 2;
    const clickY = box.y + box.height / 2;
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(400);

    // The foreground defaults to black and a flood fill always recolours its
    // seed pixel, so the on-screen pixel under the click must end up (near)
    // black. Before the fix the fill landed elsewhere and the click point kept
    // the original image colour.
    const pixel = await page.evaluate(
      ({ x, y }) => {
        const el = document.querySelector<HTMLCanvasElement>(
          '[data-testid="editor-canvas"] canvas',
        );
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const px = Math.round((x - rect.left) * dpr);
        const py = Math.round((y - rect.top) * dpr);
        const ctx = el.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        const d = ctx.getImageData(px, py, 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      },
      { x: clickX, y: clickY },
    );

    expect(pixel).not.toBeNull();
    expect(pixel?.a ?? 0).toBeGreaterThan(200); // opaque — the seed was filled
    expect(pixel?.r ?? 255).toBeLessThan(50);
    expect(pixel?.g ?? 255).toBeLessThan(50);
    expect(pixel?.b ?? 255).toBeLessThan(50);
  });
});
