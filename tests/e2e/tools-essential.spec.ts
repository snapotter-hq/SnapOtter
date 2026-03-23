import { test, expect, uploadTestImage, waitForProcessing } from "./helpers";

test.describe("Essential Tools", () => {
  // ── Resize ────────────────────────────────────────────────────────────
  test("resize tool page renders correctly", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");

    // Tool header
    await expect(page.getByText("Resize").first()).toBeVisible();

    // Should show dropzone when no file uploaded
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("resize tool shows settings after upload", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Should show settings panel with width/height inputs
    await expect(page.getByText("Settings").first()).toBeVisible();
    // Should show the image viewer instead of dropzone
    await expect(page.getByText("Upload from computer")).not.toBeVisible();
  });

  test("resize tool processes an image", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadTestImage(page);

    // Set width (required for resize)
    await page.locator("input[placeholder='Auto']").first().fill("50");

    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);

    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── Crop ──────────────────────────────────────────────────────────────
  test("crop tool page renders correctly", async ({ loggedInPage: page }) => {
    await page.goto("/crop");
    await expect(page.getByText("Crop").first()).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("crop tool shows settings after upload", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/crop");
    await uploadTestImage(page);
    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  // ── Rotate & Flip ────────────────────────────────────────────────────
  test("rotate tool page renders correctly", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/rotate");
    await expect(page.getByText("Rotate").first()).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("rotate tool shows settings after upload", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/rotate");
    await uploadTestImage(page);
    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  // ── Convert ───────────────────────────────────────────────────────────
  test("convert tool page renders correctly", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/convert");
    await expect(page.getByText("Convert").first()).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("convert tool shows format selector after upload", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/convert");
    await uploadTestImage(page);
    await expect(page.getByText("Settings").first()).toBeVisible();
  });

  // ── Compress ──────────────────────────────────────────────────────────
  test("compress tool page renders correctly", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/compress");
    await expect(page.getByText("Compress").first()).toBeVisible();
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("compress tool processes an image", async ({ loggedInPage: page }) => {
    await page.goto("/compress");
    await uploadTestImage(page);

    // Use submit button to avoid matching "Processed:" text
    await page.locator("button[type='submit']").click();

    await waitForProcessing(page);

    await expect(
      page.getByRole("link", { name: /download/i }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
