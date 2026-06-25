import { expect, test } from "./helpers";

test.describe("URL Image Import", () => {
  test("inline URL input is visible on tool page", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    await expect(page.getByPlaceholder("Paste file URL...")).toBeVisible();
  });

  test("bulk import modal opens and closes", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");

    // Open the bulk import modal
    await page.getByText("Import multiple URLs...").click();

    // Assert the modal title is visible
    await expect(page.getByText("Import from URLs")).toBeVisible();

    // Close the modal via Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Assert the modal title is no longer visible
    await expect(page.getByText("Import from URLs")).not.toBeVisible();
  });
});
