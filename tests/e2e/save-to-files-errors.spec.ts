import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Save to Files with a result URL that no longer answers (issue #1286)
//
// The review panel used to upload whatever the result URL returned, so an
// expired result put its 404 body in the library and the panel said "Saved to
// Files". Parallel-safe: it asserts on this page's own requests, never on the
// shared library list.
// ---------------------------------------------------------------------------

test.describe("Save to Files", () => {
  test("shows an error and uploads nothing when the result has expired", async ({
    loggedInPage: page,
  }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);
    await page.locator("input[placeholder='Auto']").first().fill("200");
    await page.getByTestId("resize-submit").click();
    await waitForProcessing(page);
    await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });

    // The result expires: every later fetch of it gets the API's 404.
    await page.route("**/api/v1/download/**", (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "File not found" }),
      }),
    );
    const uploads: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/v1/files/upload")) {
        uploads.push(req.url());
      }
    });

    await page.getByRole("button", { name: /save to files/i }).click();

    await expect(page.getByText("An error occurred")).toBeVisible();
    await expect(page.getByText("Saved to Files")).toHaveCount(0);
    expect(uploads).toEqual([]);

    // The error clears after a few seconds and the button can be retried.
    await expect(page.getByRole("button", { name: /save to files/i })).toBeEnabled({
      timeout: 10_000,
    });
  });
});
