import fs from "node:fs";
import path from "node:path";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

test.describe("Color Blindness Simulation tool", () => {
  test("upload -> simulate -> download cycle", async ({ loggedInPage: page }) => {
    await page.goto("/image/color-blindness");
    await expect(page.getByText("Color Blindness Simulation").first()).toBeVisible();

    await uploadTestImage(page);
    await expect(page.getByText("Upload from computer")).not.toBeVisible();

    const dropdown = page.locator("#cb-simulation-type");
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toHaveValue("deuteranomaly");

    await dropdown.selectOption("protanopia");
    await expect(dropdown).toHaveValue("protanopia");

    await page.getByTestId("color-blindness-submit").click();
    await waitForProcessing(page);

    const downloadBtn = page.getByTestId("color-blindness-download");
    await expect(downloadBtn).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();

    const downloadPath = path.join(
      process.cwd(),
      "test-results",
      "download-color-blindness-result",
    );
    await download.saveAs(downloadPath);
    const stat = fs.statSync(downloadPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test("shows type description when selection changes", async ({ loggedInPage: page }) => {
    await page.goto("/image/color-blindness");
    await uploadTestImage(page);

    const dropdown = page.locator("#cb-simulation-type");
    await dropdown.selectOption("achromatopsia");

    await expect(page.getByText("Complete color blindness", { exact: false })).toBeVisible();
  });
});
