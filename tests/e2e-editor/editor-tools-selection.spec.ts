import { createNewDocument, expect, selectTool, test } from "./helpers";

test.describe("Editor Selection Tools", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
  });

  test("move tool activates via V shortcut", async ({ editorPage: page }) => {
    // Start with a different tool
    await selectTool(page, "brush");

    await page.keyboard.press("v");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='move']")).toHaveAttribute("data-tool-active", "true");
  });

  test("move tool shows options bar label", async ({ editorPage: page }) => {
    await selectTool(page, "move");

    // Options bar should show "move" label
    const optionsBar = page.locator('[data-testid="editor-options-bar"]');
    await expect(optionsBar.getByText("move", { exact: false })).toBeVisible();
  });

  test("marquee activates via M shortcut", async ({ editorPage: page }) => {
    await page.keyboard.press("m");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='marquee-rect']")).toHaveAttribute(
      "data-tool-active",
      "true",
    );
  });

  test("marquee cycles subtypes on repeated M press", async ({ editorPage: page }) => {
    await page.keyboard.press("m");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='marquee-rect']")).toHaveAttribute(
      "data-tool-active",
      "true",
    );

    // Press M again to cycle to ellipse marquee
    await page.keyboard.press("m");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='marquee-rect']")).toHaveAttribute(
      "data-tool-active",
      "false",
    );
  });

  test("crop activates via C shortcut", async ({ editorPage: page }) => {
    await page.keyboard.press("c");
    await page.waitForTimeout(300);

    await expect(page.locator("[data-tool='crop']")).toHaveAttribute("data-tool-active", "true");
  });

  test("crop options show aspect ratio dropdown", async ({ editorPage: page }) => {
    await selectTool(page, "crop");

    // Crop options bar should have aspect ratio dropdown
    const ratioLabel = page.getByText("Ratio:");
    await expect(ratioLabel).toBeVisible();

    const ratioSelect = page.locator("#crop-aspect");
    await expect(ratioSelect).toBeVisible();

    // The dropdown should have a "Free" option
    const freeOption = ratioSelect.locator("option", { hasText: "Free" });
    await expect(freeOption).toBeAttached();
  });

  test("crop options show width and height inputs", async ({ editorPage: page }) => {
    await selectTool(page, "crop");

    await expect(page.locator("#crop-width")).toBeVisible();
    await expect(page.locator("#crop-height")).toBeVisible();
  });

  test("crop options show apply and cancel buttons", async ({ editorPage: page }) => {
    await selectTool(page, "crop");

    await expect(page.locator("button[aria-label='Apply crop']")).toBeVisible();
    await expect(page.locator("button[aria-label='Cancel crop']")).toBeVisible();
  });
});
