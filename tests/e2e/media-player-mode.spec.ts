import path from "node:path";
import { expect, test, waitForProcessing } from "./helpers";

const MP4_FIXTURE = path.join(process.cwd(), "tests", "fixtures", "video", "formats", "tiny.mp4");

test.describe("Media-player display mode (mute-video)", () => {
  test("uploads a video, mutes it, and shows the media player with processed result", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/mute-video");

    // Upload tiny.mp4 via the file chooser (dropzone click)
    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadButton = page.getByRole("button", { name: /upload from computer/i }).first();
    if (await uploadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadButton.click();
    } else {
      await page.locator("[class*='border-dashed']").first().click();
    }
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(MP4_FIXTURE);
    await page.waitForTimeout(500);

    // The media-player view should show the source video immediately
    const videoEl = page.locator("[data-testid='media-player-video']");
    await expect(videoEl).toBeVisible({ timeout: 15_000 });

    // Click submit to mute the video
    await page.getByTestId("mute-video-submit").click();

    // Wait for processing to complete (spinner disappears)
    await waitForProcessing(page, 60_000);

    // After processing, the review panel appears with a Download button
    await expect(page.getByText("Download").first()).toBeVisible({ timeout: 30_000 });

    // The media player should still be visible and now show the processed result
    await expect(videoEl).toBeVisible();
    const src = await videoEl.getAttribute("src");
    expect(src).toBeTruthy();
    expect(src!.length).toBeGreaterThan(0);
  });

  test("media player video element has controls attribute", async ({ loggedInPage: page }) => {
    await page.goto("/mute-video");

    // Upload tiny.mp4
    const fileChooserPromise = page.waitForEvent("filechooser");
    const uploadButton = page.getByRole("button", { name: /upload from computer/i }).first();
    if (await uploadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await uploadButton.click();
    } else {
      await page.locator("[class*='border-dashed']").first().click();
    }
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(MP4_FIXTURE);
    await page.waitForTimeout(500);

    const videoEl = page.locator("[data-testid='media-player-video']");
    await expect(videoEl).toBeVisible({ timeout: 15_000 });
    await expect(videoEl).toHaveAttribute("controls", /.*/);
  });
});
