import path from "node:path";
import { expect, test } from "./helpers";

function fixturePath(name: string): string {
  return path.join(process.cwd(), "tests", "fixtures", name);
}

async function uploadFile(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  const dropzone = page.locator("[class*='border-dashed']").first();
  await dropzone.click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(1000);
}

test.describe("Blur Faces tool", () => {
  test("page loads with correct UI controls", async ({ loggedInPage: page }) => {
    await page.goto("/blur-faces");

    await expect(page.getByText("Blur Radius")).toBeVisible();
    await expect(page.getByText("Detection Sensitivity")).toBeVisible();
    await expect(page.getByTestId("blur-faces-submit")).toBeVisible();
  });

  test("HEIC image processes without error", async ({ loggedInPage: page }) => {
    await page.goto("/blur-faces");
    await uploadFile(page, fixturePath("test-portrait.heic"));

    await page.getByTestId("blur-faces-submit").click();

    // Should complete without the old "cannot identify image file" error
    await expect(
      page.getByTestId("blur-faces-download").or(page.getByText("No faces detected")).first(),
    ).toBeVisible({ timeout: 300_000 });

    await expect(page.locator("text=cannot identify image")).not.toBeVisible();
  });

  test("no-face image shows warning message", async ({ loggedInPage: page }) => {
    await page.goto("/blur-faces");
    await uploadFile(page, fixturePath("test-blank.png"));

    await page.getByTestId("blur-faces-submit").click();

    await expect(page.getByText("No faces detected")).toBeVisible({ timeout: 300_000 });
  });
});
