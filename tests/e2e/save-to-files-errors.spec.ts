import type { Page } from "@playwright/test";
import { en } from "@snapotter/shared";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Save to Files when the save can't succeed (issues #1286, #1350)
//
// The review panel used to upload whatever the result URL returned, so an
// expired result put its 404 body in the library and the panel said "Saved to
// Files" (#1286). Then it said "An error occurred" for every failure, even
// when the server had said why (#1350). Parallel-safe: it asserts on this
// page's own requests, never on the shared library list.
// ---------------------------------------------------------------------------

async function resizeOnce(page: Page) {
  await page.goto("/image/resize");
  await uploadTestImage(page);
  await page.locator("input[placeholder='Auto']").first().fill("200");
  await page.getByTestId("resize-submit").click();
  await waitForProcessing(page);
  await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });
}

function trackUploads(page: Page): string[] {
  const uploads: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/v1/files/upload")) {
      uploads.push(req.url());
    }
  });
  return uploads;
}

test.describe("Save to Files", () => {
  test("says the result has expired, uploads nothing, and offers no retry", async ({
    loggedInPage: page,
  }) => {
    await resizeOnce(page);

    // The result expires: every later fetch of it gets the API's 404.
    await page.route("**/api/v1/download/**", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "File not found" }),
      }),
    );
    const uploads = trackUploads(page);

    await page.getByRole("button", { name: /save to files/i }).click();

    const expired = page.getByRole("button", { name: en.toolPage.resultExpired });
    await expect(expired).toBeVisible();
    await expect(expired).toBeDisabled();
    await expect(page.getByText("Saved to Files")).toHaveCount(0);
    expect(uploads).toEqual([]);

    // A retry would fetch the same missing result, so the message stays and
    // the button doesn't come back (the generic error resets after 3s).
    await page.waitForTimeout(4_000);
    await expect(expired).toBeVisible();
    await expect(page.getByRole("button", { name: en.toolPage.saveToFiles })).toHaveCount(0);
  });

  test("says the library is full when the upload is over quota", async ({ loggedInPage: page }) => {
    await resizeOnce(page);

    await page.route("**/api/v1/files/upload", (route) =>
      route.fulfill({
        status: 413,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Storage quota exceeded. Used 10.0MB of 10.0MB",
          code: "STORAGE_QUOTA_EXCEEDED",
        }),
      }),
    );

    await page.getByRole("button", { name: /save to files/i }).click();

    const full = page.getByRole("button", { name: en.toolPage.libraryFull });
    await expect(full).toBeVisible();
    // Freeing space makes a retry worthwhile, so the button stays live.
    await expect(full).toBeEnabled();
    await expect(page.getByText(en.common.error)).toHaveCount(0);
  });
});
