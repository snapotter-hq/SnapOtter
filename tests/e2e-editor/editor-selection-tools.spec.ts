import { createNewDocument, drawOnCanvas, expect, selectTool, test } from "./helpers";

test.describe("Editor Selection Tools", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  test("rectangle selection creates visible selection area", async ({ editorPage: page }) => {
    test.slow();

    await selectTool(page, "marquee-rect");

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    // Drag to create a rectangular selection
    await drawOnCanvas(page, 100, 100, 300, 250);
    await page.waitForTimeout(500);

    const after = await canvas.screenshot();
    // The marching ants overlay should cause a visual difference
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("lasso tool creates selection", async ({ editorPage: page }) => {
    test.slow();

    // Activate the lasso-free tool
    await selectTool(page, "lasso-free");

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    // Draw a freehand lasso path (needs enough points to form a polygon)
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 100, { steps: 5 });
    await page.mouse.move(box.x + 200, box.y + 200, { steps: 5 });
    await page.mouse.move(box.x + 100, box.y + 200, { steps: 5 });
    await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("magic wand tool creates selection on click", async ({ editorPage: page }) => {
    test.slow();

    // Draw something first so the magic wand has varied pixel data
    await selectTool(page, "brush");
    await drawOnCanvas(page, 100, 100, 300, 300);
    await page.waitForTimeout(300);

    // Switch to magic wand
    await selectTool(page, "magic-wand");
    await page.waitForTimeout(300);

    // Click a blank area to select it. Use the canvas centre: it always maps
    // inside the document, whereas a corner can fall in the checkerboard
    // padding around a centred document (out of bounds -> no selection).
    const canvas = page.locator("canvas").first();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // A selection renders as black+white dashed "marching ants" (Konva nodes
    // with a dash and stroke #000000/#ffffff; a wand selection uses Shape
    // nodes). The brush stroke is solid (no dash), so it is excluded. The wand
    // flood-fill + outline render can take a moment on a large canvas, so poll.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const konva = (
              window as unknown as {
                Konva?: {
                  stages: Array<{
                    find(
                      selector: string,
                    ): Array<{ stroke(): string; dash(): number[] | undefined }>;
                  }>;
                };
              }
            ).Konva;
            if (!konva?.stages?.length) return false;
            const stage = konva.stages[0];
            const isMarchingAnts = (node: { stroke(): string; dash(): number[] | undefined }) =>
              (node.dash()?.length ?? 0) > 0 &&
              (node.stroke() === "#000000" || node.stroke() === "#ffffff");
            return ["Shape", "Rect", "Ellipse", "Line"].some((cls) =>
              stage.find(cls).some(isMarchingAnts),
            );
          }),
        { timeout: 12000 },
      )
      .toBe(true);
  });

  test("selection mode toggle (add/subtract) exists in options bar", async ({
    editorPage: page,
  }) => {
    await selectTool(page, "marquee-rect");

    // The options bar should show Mode label
    await expect(page.getByText("Mode:")).toBeVisible();

    // New, Add, Sub buttons should be visible
    const newBtn = page.locator("button[aria-label='New Selection']");
    const addBtn = page.locator("button[aria-label='Add to Selection']");
    const subBtn = page.locator("button[aria-label='Subtract from Selection']");

    await expect(newBtn).toBeVisible();
    await expect(addBtn).toBeVisible();
    await expect(subBtn).toBeVisible();

    // "New" should be active by default
    await expect(newBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("Ctrl+D deselects", async ({ editorPage: page }) => {
    test.slow();

    // Create a selection first
    await selectTool(page, "marquee-rect");
    await drawOnCanvas(page, 100, 100, 300, 250);
    await page.waitForTimeout(500);

    const canvas = page.locator("canvas").first();
    const withSelection = await canvas.screenshot();

    // Press Ctrl+D to deselect
    await page.keyboard.press("Control+d");
    await page.waitForTimeout(500);

    const afterDeselect = await canvas.screenshot();
    // The marching ants should disappear, making a visual difference
    expect(Buffer.compare(withSelection, afterDeselect)).not.toBe(0);
  });

  test("Ctrl+Shift+I inverts selection", async ({ editorPage: page }) => {
    test.slow();

    // Create a selection first
    await selectTool(page, "marquee-rect");
    await drawOnCanvas(page, 100, 100, 200, 200);
    await page.waitForTimeout(500);

    const canvas = page.locator("canvas").first();
    const beforeInvert = await canvas.screenshot();

    // Press Ctrl+Shift+I to invert selection
    await page.keyboard.press("Control+Shift+i");
    await page.waitForTimeout(500);

    const afterInvert = await canvas.screenshot();
    // The selection bounds should change, causing a visual difference
    expect(Buffer.compare(beforeInvert, afterInvert)).not.toBe(0);
  });
});
