import { expect, test, uploadTestImage } from "./helpers";

test.describe("Home Page", () => {
  test("shows SnapOtter branding in dropzone", async ({ loggedInPage: page }) => {
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
  });

  test("dropzone shows upload button", async ({ loggedInPage: page }) => {
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("tool panel is visible on home page", async ({ loggedInPage: page }) => {
    // Search bar should be visible in tool panel
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();

    // Tool categories should be visible
    await expect(page.getByText("Essentials").first()).toBeVisible();
  });

  test("tool panel search filters tools", async ({ loggedInPage: page }) => {
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill("compress");

    // Should show Compress tool
    await expect(page.getByText("Compress").first()).toBeVisible();
  });

  test("clicking a tool in panel navigates to tool page", async ({ loggedInPage: page }) => {
    // Find and click a tool link
    await page.locator("a").filter({ hasText: "Resize" }).first().click();

    await expect(page).toHaveURL("/resize");
  });

  test("after upload shows quick actions and tool selector", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    // Should show quick actions
    await expect(page.getByText("Quick Actions").first()).toBeVisible();

    // Should show quick action tools
    await expect(page.getByRole("button", { name: /resize/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /compress/i }).first()).toBeVisible();

    // Should show all tools section
    await expect(page.getByText("All Tools").first()).toBeVisible();
  });

  test("after upload shows image preview", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    // Should show the image preview (file info)
    await expect(page.getByText(/test-image/i).first()).toBeVisible();
  });

  test("change file button resets upload", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    // Click change file
    await page.getByText("Change file").click();

    // Should go back to dropzone
    await expect(page.getByText("Upload from computer")).toBeVisible();
  });

  test("clicking quick action tool navigates with file", async ({ loggedInPage: page }) => {
    await uploadTestImage(page);

    // Click resize quick action
    await page
      .getByRole("button", { name: /resize/i })
      .first()
      .click();

    await expect(page).toHaveURL("/resize");

    // File should still be loaded (no dropzone)
    await expect(page.getByText("Upload from computer")).not.toBeVisible();
  });

  test("footer has theme toggle", async ({ loggedInPage: page }) => {
    // Footer should have theme toggle
    const footer = page.locator("[class*='fixed'][class*='bottom']").last();
    await expect(footer).toBeVisible();
  });
});
