import { createNewDocument, expect, test } from "./helpers";

test.describe("Editor Layers Panel", () => {
  test.beforeEach(async ({ editorPage: page }) => {
    await createNewDocument(page);
    // Ensure layers tab is active
    await page.locator("[data-testid='tab-layers']").click();
    await page.waitForTimeout(300);
  });

  test("layers panel shows default Layer 1", async ({ editorPage: page }) => {
    const layersPanel = page.locator("[data-testid='layers-panel']");
    await expect(layersPanel).toBeVisible();

    // Should have at least one layer with "Layer 1" text
    const layerRows = layersPanel.locator("[data-layer-id]");
    await expect(layerRows).toHaveCount(1);
    await expect(layersPanel.getByText("Layer 1")).toBeVisible();
  });

  test("add layer button creates new layer", async ({ editorPage: page }) => {
    const addBtn = page.locator("[data-testid='add-layer-btn']");
    await expect(addBtn).toBeVisible();

    await addBtn.click();
    await page.waitForTimeout(300);

    // Now there should be 2 layers
    const layersPanel = page.locator("[data-testid='layers-panel']");
    const layerRows = layersPanel.locator("[data-layer-id]");
    await expect(layerRows).toHaveCount(2);
  });

  test("cannot delete last layer", async ({ editorPage: page }) => {
    const deleteBtn = page.locator("[data-testid='delete-layer-btn']");
    await expect(deleteBtn).toBeVisible();

    // With only one layer, delete button should be disabled
    await expect(deleteBtn).toBeDisabled();
  });

  test("delete button enabled with multiple layers", async ({ editorPage: page }) => {
    // Add a second layer
    await page.locator("[data-testid='add-layer-btn']").click();
    await page.waitForTimeout(300);

    const deleteBtn = page.locator("[data-testid='delete-layer-btn']");
    await expect(deleteBtn).toBeEnabled();
  });

  test("eye icon toggles visibility", async ({ editorPage: page }) => {
    const layersPanel = page.locator("[data-testid='layers-panel']");
    const layerRow = layersPanel.locator("[data-layer-id]").first();

    // Initially visible (Eye icon, aria-label "Hide layer")
    const hideBtn = layerRow.locator("button[aria-label='Hide layer']");
    await expect(hideBtn).toBeVisible();

    // Click to hide
    await hideBtn.click();
    await page.waitForTimeout(300);

    // Now should show "Show layer" button
    const showBtn = layerRow.locator("button[aria-label='Show layer']");
    await expect(showBtn).toBeVisible();

    // Click again to show
    await showBtn.click();
    await page.waitForTimeout(300);

    await expect(layerRow.locator("button[aria-label='Hide layer']")).toBeVisible();
  });

  test("lock icon toggles lock state", async ({ editorPage: page }) => {
    const layersPanel = page.locator("[data-testid='layers-panel']");
    const layerRow = layersPanel.locator("[data-layer-id]").first();

    // Initially unlocked
    const lockBtn = layerRow.locator("button[aria-label='Lock layer']");
    await expect(lockBtn).toBeVisible();

    await lockBtn.click();
    await page.waitForTimeout(300);

    // Now should show "Unlock layer"
    const unlockBtn = layerRow.locator("button[aria-label='Unlock layer']");
    await expect(unlockBtn).toBeVisible();
  });

  test("blend mode dropdown shows modes", async ({ editorPage: page }) => {
    const blendSelect = page.locator("[data-testid='blend-mode-select']");
    await expect(blendSelect).toBeVisible();

    // Check that it has the expected blend mode options
    const options = blendSelect.locator("option");
    const texts = await options.allTextContents();

    expect(texts).toContain("Normal");
    expect(texts).toContain("Multiply");
    expect(texts).toContain("Screen");
    expect(texts).toContain("Overlay");
    expect(texts).toContain("Darken");
    expect(texts).toContain("Lighten");
  });

  test("opacity slider works", async ({ editorPage: page }) => {
    const slider = page.locator("[data-testid='layer-opacity-slider']");
    await expect(slider).toBeVisible();

    // Default opacity should be 100
    await expect(slider).toHaveValue("100");

    // Change opacity
    await slider.fill("50");
    await page.waitForTimeout(300);

    await expect(slider).toHaveValue("50");
  });

  test("double-click layer name enters rename mode", async ({ editorPage: page }) => {
    const layersPanel = page.locator("[data-testid='layers-panel']");

    // Double-click the layer name button
    const nameBtn = layersPanel
      .locator("[data-layer-id]")
      .first()
      .locator("button")
      .filter({ hasText: "Layer 1" });
    await nameBtn.dblclick();
    await page.waitForTimeout(300);

    // An input for renaming should appear
    const renameInput = layersPanel.locator("input[type='text'][class*='bg-muted']");
    await expect(renameInput).toBeVisible();
  });

  test("layer row highlights active layer", async ({ editorPage: page }) => {
    const layersPanel = page.locator("[data-testid='layers-panel']");
    const layerRow = layersPanel.locator("[data-layer-id]").first();

    await expect(layerRow).toHaveAttribute("aria-current", "true");
  });

  test("Enter selects an inactive layer from its name button", async ({ editorPage: page }) => {
    await page.getByTestId("add-layer-btn").click();
    const layerOne = page.getByTestId(/^layer-name-/).filter({ hasText: "Layer 1" });
    await expect(layerOne).toHaveAttribute("aria-pressed", "false");

    await layerOne.focus();
    await page.keyboard.press("Enter");

    await expect(layerOne).toHaveAttribute("aria-pressed", "true");
  });

  test("Space selects an inactive layer from its name button", async ({ editorPage: page }) => {
    await page.getByTestId("add-layer-btn").click();
    const layerOne = page.getByTestId(/^layer-name-/).filter({ hasText: "Layer 1" });
    await expect(layerOne).toHaveAttribute("aria-pressed", "false");

    await layerOne.focus();
    await page.keyboard.press("Space");

    await expect(layerOne).toHaveAttribute("aria-pressed", "true");
  });

  test("keyboard-accessible controls reorder the active layer", async ({ editorPage: page }) => {
    await page.getByTestId("add-layer-btn").click();
    const rows = page.locator("[data-layer-id]");
    await expect(rows).toHaveText(["Layer 2", "Layer 1"]);

    const moveDown = page.getByRole("button", { name: "Move down: Layer 2" });
    await moveDown.focus();
    await page.keyboard.press("Enter");
    await expect(rows).toHaveText(["Layer 1", "Layer 2"]);

    const moveUp = page.getByRole("button", { name: "Move up: Layer 2" });
    await moveUp.focus();
    await page.keyboard.press("Space");
    await expect(rows).toHaveText(["Layer 2", "Layer 1"]);
  });
});
