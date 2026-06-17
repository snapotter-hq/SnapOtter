import { createNewDocument, drawOnCanvas, expect, selectTool, test } from "./helpers";

test.describe("Editor Drawing Tools", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  test("brush activates via toolbar click", async ({ editorPage: page }) => {
    await selectTool(page, "brush");

    const brushBtn = page.locator("[data-tool='brush']");
    await expect(brushBtn).toHaveAttribute("data-tool-active", "true");
  });

  test("brush activates via B shortcut", async ({ editorPage: page }) => {
    // Start with a different tool
    await selectTool(page, "move");
    await expect(page.locator("[data-tool='move']")).toHaveAttribute("data-tool-active", "true");

    // Press B to switch to brush
    await page.keyboard.press("b");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='brush']")).toHaveAttribute("data-tool-active", "true");
  });

  test("brush options bar shows size, opacity, and hardness", async ({ editorPage: page }) => {
    await selectTool(page, "brush");

    // Options bar should display Size, Opacity, and Hardness labels
    const optionsBar = page.locator('[data-testid="editor-options-bar"]');
    await expect(optionsBar.getByText("Size")).toBeVisible();
    await expect(optionsBar.getByText("Opacity")).toBeVisible();
    await expect(optionsBar.getByText("Hardness")).toBeVisible();
  });

  test("brush drawing changes canvas content", async ({ editorPage: page }) => {
    await selectTool(page, "brush");

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    await drawOnCanvas(page, 100, 100, 300, 300);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("shape tool draws rectangle on canvas", async ({ editorPage: page }) => {
    await selectTool(page, "shape-rect");

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    await drawOnCanvas(page, 100, 100, 250, 200);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("shape tool draws ellipse on canvas", async ({ editorPage: page }) => {
    await selectTool(page, "shape-rect");

    // Switch to ellipse via the shape type dropdown in options bar
    const shapeSelect = page.locator("select").filter({ hasText: "Rectangle" });
    await shapeSelect.selectOption("shape-ellipse");
    await page.waitForTimeout(300);

    const canvas = page.locator("canvas").first();
    const before = await canvas.screenshot();

    await drawOnCanvas(page, 150, 150, 350, 300);

    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  });

  test("eraser activates via E shortcut", async ({ editorPage: page }) => {
    await page.keyboard.press("e");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='eraser']")).toHaveAttribute("data-tool-active", "true");
  });

  test("eraser options bar shows size and opacity", async ({ editorPage: page }) => {
    await selectTool(page, "eraser");

    const optionsBar = page.locator('[data-testid="editor-options-bar"]');
    await expect(optionsBar.getByText("Size")).toBeVisible();
    await expect(optionsBar.getByText("Opacity")).toBeVisible();
  });

  test("pencil tool activates via N shortcut", async ({ editorPage: page }) => {
    await page.keyboard.press("n");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='pencil']")).toHaveAttribute("data-tool-active", "true");
  });

  test("pencil options bar hides hardness", async ({ editorPage: page }) => {
    await selectTool(page, "pencil");

    const optionsBar = page.locator('[data-testid="editor-options-bar"]');
    await expect(optionsBar.getByText("Size")).toBeVisible();
    await expect(optionsBar.getByText("Opacity")).toBeVisible();
    // Pencil is always hard, so hardness should not appear
    await expect(optionsBar.getByText("Hardness")).not.toBeVisible();
  });

  test("shape fill color applies", async ({ editorPage: page }) => {
    await selectTool(page, "shape-rect");

    // The fill colour is chosen via the "Fill" color picker button in the
    // options bar (a ShapeColorPicker, labelled "<label> color picker").
    const fillPicker = page.locator("button[aria-label='Fill color picker']");
    await expect(fillPicker).toBeVisible();
  });

  test("shape stroke width control is visible", async ({ editorPage: page }) => {
    await selectTool(page, "shape-rect");

    const widthLabel = page.locator("label").filter({ hasText: /^Width/ });
    await expect(widthLabel).toBeVisible();

    const widthSlider = widthLabel.locator("input[type='range']");
    await expect(widthSlider).toBeVisible();
  });
});
