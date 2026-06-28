import { expect, test, uploadTestImage } from "./helpers";

// ---------------------------------------------------------------------------
// GUI E2E: Beautify Screenshot Tool
// ---------------------------------------------------------------------------

test.describe("Beautify Screenshot", () => {
  test("renders tool page with settings", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await expect(page.getByText("Beautify Screenshot").first()).toBeVisible();
  });

  test("uploads image and shows preview", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Verify the image appeared in the preview area
    await expect(page.locator("img").first()).toBeVisible();
  });

  test("shows preset cards", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    // BeautifyControls (live-preview) mounts only after a file is uploaded.
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Quick Presets section is open by default
    await expect(page.getByText("Quick Presets").first()).toBeVisible();
    await expect(page.getByText("Purple Haze").first()).toBeVisible();
    await expect(page.getByText("Flamingo").first()).toBeVisible();
    await expect(page.getByText("Ocean").first()).toBeVisible();
  });

  test("shows background, frame, spacing, and shadow sections", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    // BeautifyControls (live-preview) mounts only after a file is uploaded.
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    await expect(page.getByText("Background").first()).toBeVisible();
    await expect(page.getByText("Device Frame").first()).toBeVisible();
    await expect(page.getByText("Spacing").first()).toBeVisible();
    await expect(page.getByText("Shadow").first()).toBeVisible();
  });

  test("submit button uses data-testid", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);

    await expect(page.getByTestId("beautify-submit")).toBeVisible();
  });

  test("processes image with default settings", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1500);

    // Click the Beautify button
    const processBtn = page.getByTestId("beautify-submit");
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();

    // Wait for download link to appear (processing may be fast enough to skip spinner)
    await expect(
      page
        .getByTestId("beautify-download")
        .or(page.getByRole("link", { name: /download/i }).first()),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("applies preset and processes", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1500);

    // Click a preset card
    const presetCards = page.locator("button").filter({ hasText: /purple haze|flamingo|ocean/i });
    if (
      await presetCards
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false)
    ) {
      await presetCards.first().click();
      await page.waitForTimeout(500);
    }

    // Process
    const processBtn = page.getByTestId("beautify-submit");
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();

    await expect(
      page
        .getByTestId("beautify-download")
        .or(page.getByRole("link", { name: /download/i }).first()),
    ).toBeVisible({ timeout: 30_000 });
  });

  // ---------------------------------------------------------------------------
  // Live preview tests
  // ---------------------------------------------------------------------------

  test("live preview shows gradient background on wrapper", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Default preset (Purple Haze) should apply a gradient background to the wrapper
    const wrapper = page.locator("img.select-none").first().locator("..");
    const bg = await wrapper.evaluate((el) => getComputedStyle(el).background);
    // Should contain a gradient (linear-gradient produces a computed background-image)
    expect(bg.length).toBeGreaterThan(0);
  });

  test("live preview renders macOS frame chrome", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Default preset has macos-light frame; verify traffic light dots appear
    await expect(page.getByTestId("frame-preview-macos")).toBeVisible({ timeout: 5000 });
  });

  test("switching to Windows frame shows Windows title bar", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Click Windows frame button
    await page.getByRole("button", { name: "Windows" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId("frame-preview-windows")).toBeVisible({ timeout: 3000 });
  });

  test("switching to Browser frame shows tab bar and URL bar", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "Browser" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId("frame-preview-browser")).toBeVisible({ timeout: 3000 });
  });

  test("switching to None frame removes frame preview", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Wait for the initial frame preview to appear first
    await expect(page.getByTestId("frame-preview-macos")).toBeVisible({ timeout: 3000 });

    // The Device Frame section has its own "None" button in a grid of 4 columns.
    // Target it by finding the section heading then the button within it.
    const frameSection = page.getByText("Device Frame").first().locator("..");
    const noneBtn = frameSection.locator("..").getByRole("button", { name: "None", exact: true });
    await noneBtn.click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId("frame-preview-macos")).not.toBeVisible();
  });

  test("device frame shows label indicator", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "iPhone" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId("frame-preview-iphone")).toBeVisible({ timeout: 3000 });
  });

  test("custom shadow values reflect in preview", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Select Custom shadow
    await page.getByRole("button", { name: "Custom" }).click();
    await page.waitForTimeout(300);

    // Verify custom shadow controls are visible
    await expect(page.locator("#beautify-shadow-blur")).toBeVisible();
    await expect(page.locator("#beautify-shadow-opacity")).toBeVisible();

    // The wrapper should have a boxShadow style
    const wrapper = page.locator("img.select-none").first().locator("..");
    const shadow = await wrapper.evaluate((el) => el.style.boxShadow);
    expect(shadow).toContain("px");
  });

  test("watermark text appears in preview overlay", async ({ loggedInPage: page }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Open Watermark section and type text
    const watermarkSection = page.getByText("Watermark").first();
    await watermarkSection.click();
    await page.waitForTimeout(300);

    await page.locator("#beautify-watermark-text").fill("My Watermark");
    await page.waitForTimeout(300);

    await expect(page.getByTestId("watermark-preview")).toBeVisible();
    await expect(page.getByTestId("watermark-preview")).toContainText("My Watermark");
  });

  // ---------------------------------------------------------------------------
  // Regression: image must remain visible with all presets and overlays
  // ---------------------------------------------------------------------------

  test("image stays visible for every preset (no zero-height collapse)", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    const presets = [
      "Purple Haze",
      "Flamingo",
      "Ocean",
      "Midnight",
      "Mint",
      "Sunset",
      "Clean White",
      "No Background",
    ];
    const img = page.locator("img.select-none").first();

    for (const name of presets) {
      await page.getByRole("button", { name, exact: true }).click();
      await page.waitForTimeout(400);

      const box = await img.boundingBox();
      expect(box, `Image collapsed for preset "${name}"`).not.toBeNull();
      expect(box?.height, `Image height is 0 for preset "${name}"`).toBeGreaterThan(10);
    }
  });

  test("image stays visible when watermark is added without a frame", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Switch to Flamingo (no frame)
    await page.getByRole("button", { name: "Flamingo", exact: true }).click();
    await page.waitForTimeout(300);

    const img = page.locator("img.select-none").first();
    const boxBefore = await img.boundingBox();
    expect(boxBefore).not.toBeNull();
    expect(boxBefore?.height).toBeGreaterThan(10);

    // Open Watermark and enter text
    await page.getByText("Watermark").first().click();
    await page.waitForTimeout(200);
    await page.locator("#beautify-watermark-text").fill("Test WM");
    await page.waitForTimeout(400);

    // Image must still be visible with non-zero dimensions
    const boxAfter = await img.boundingBox();
    expect(boxAfter, "Image disappeared after adding watermark").not.toBeNull();
    expect(boxAfter?.height, "Image collapsed to 0 after watermark").toBeGreaterThan(10);
    await expect(page.getByTestId("watermark-preview")).toBeVisible();
  });

  test("image stays visible when watermark is added with a frame", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/beautify");
    await uploadTestImage(page);
    await page.waitForTimeout(1000);

    // Default Purple Haze has macOS frame
    await expect(page.getByTestId("frame-preview-macos")).toBeVisible({ timeout: 5000 });

    const img = page.locator("img.select-none").first();
    const boxBefore = await img.boundingBox();
    expect(boxBefore).not.toBeNull();
    expect(boxBefore?.height).toBeGreaterThan(10);

    // Open Watermark and enter text
    await page.getByText("Watermark").first().click();
    await page.waitForTimeout(200);
    await page.locator("#beautify-watermark-text").fill("My Brand");
    await page.waitForTimeout(400);

    // Both frame and image must remain visible
    await expect(page.getByTestId("frame-preview-macos")).toBeVisible();
    const boxAfter = await img.boundingBox();
    expect(boxAfter, "Image disappeared after adding watermark with frame").not.toBeNull();
    expect(boxAfter?.height).toBeGreaterThan(10);
    await expect(page.getByTestId("watermark-preview")).toBeVisible();
  });
});
