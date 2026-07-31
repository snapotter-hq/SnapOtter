import { expect, putPreferences, test } from "./helpers";

// Mutates the shared per-user `pinnedTools` preference on the server, so it
// pins and then unpins within the single test to leave state clean.
test.describe("Pin tools", () => {
  test("pin a tool, persist across reload, then unpin", async ({ loggedInPage: page }) => {
    // Start from a known-empty pin state. CI retries once, and a prior attempt
    // that failed after pinning but before unpinning leaves a server-side pin,
    // which would fail the "not pinned yet" assertion below on the retry.
    expect((await putPreferences(page, { pinnedTools: [] })).ok).toBeTruthy();
    await page.reload();

    // Resize lives under Image > Essentials on the All tab (default).
    const pinToggle = page.getByTestId("pin-toggle-resize").first();
    await expect(pinToggle).toBeVisible();

    // Not pinned yet: no Pinned section heading.
    await expect(page.getByRole("heading", { name: /^Pinned$/i })).toHaveCount(0);

    // Pin it.
    await pinToggle.click();

    // The Pinned section appears with the Resize card.
    await expect(page.getByRole("heading", { name: /^Pinned$/i })).toBeVisible();

    // Reload: the pin persisted server-side and re-hydrates.
    await page.reload();
    await expect(page.getByRole("heading", { name: /^Pinned$/i })).toBeVisible();

    // Unpin (there are two Resize pin toggles now: one in Pinned, one in the
    // Image group). Either flips the shared state; click the first and assert
    // the section is gone.
    await page.getByTestId("pin-toggle-resize").first().click();
    await expect(page.getByRole("heading", { name: /^Pinned$/i })).toHaveCount(0);
  });
});
