import fs from "node:fs";
import type { Page } from "@playwright/test";
import { expect, getTestImagePath, test, uploadTestImage, waitForProcessing } from "./helpers";

// ---------------------------------------------------------------------------
// Library save-mode choice (issue #495)
//
// When a tool input comes from the file library, the tool page offers a
// per-edit choice: save the result as a new file (default, original stays)
// or overwrite the original (superseding version). Serial bucket: these
// tests assert on the global library list.
// ---------------------------------------------------------------------------

async function authHeaders(page: Page): Promise<Record<string, string>> {
  const token = await page
    .evaluate(() => localStorage.getItem("snapotter-token"))
    .catch(() => null);
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Upload a PNG into the library via the API, return its file id. */
async function seedLibraryFile(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/v1/files/upload", {
    headers: await authHeaders(page),
    multipart: {
      file: { name, mimeType: "image/png", buffer: fs.readFileSync(getTestImagePath()) },
    },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).files[0].id;
}

/** List library file ids matching a search term. */
async function listLibraryIds(page: Page, search: string): Promise<string[]> {
  const res = await page.request.get(`/api/v1/files?search=${encodeURIComponent(search)}`, {
    headers: await authHeaders(page),
  });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()).files as Array<{ id: string }>).map((f) => f.id);
}

/** Import a seeded library file into the resize tool via the files page. */
async function importIntoResize(page: Page, filename: string) {
  await page.goto("/image/resize");
  await page.getByRole("link", { name: /import from files/i }).click();
  await expect(page).toHaveURL(/\/files/);

  // Search (300ms debounce), then select the file row and confirm
  await page.getByPlaceholder("Search files...").fill(filename.replace(".png", ""));
  await page.getByText(filename, { exact: true }).first().click();
  await page.getByRole("button", { name: /select file/i }).click();

  // Back on the tool page with the file staged and library-linked
  await expect(page).toHaveURL(/\/image\/resize/);
  await expect(page.getByText("This file is from your Files")).toBeVisible({ timeout: 10_000 });
}

async function processResize(page: Page) {
  await page.locator("input[placeholder='Auto']").first().fill("200");
  await page.getByTestId("resize-submit").click();
  await waitForProcessing(page);
  await expect(page.getByTestId("resize-download")).toBeVisible({ timeout: 15_000 });
}

test.describe("Library save mode", () => {
  test("default keeps the original and saves the result as a new file", async ({
    loggedInPage: page,
  }) => {
    const filename = `lsm-default-${Date.now()}.png`;
    const originalId = await seedLibraryFile(page, filename);

    await importIntoResize(page, filename);

    // Non-destructive default is preselected
    await expect(page.getByRole("radio", { name: /save result as a new file/i })).toBeChecked();

    await processResize(page);

    // The review panel reflects the auto-save instead of the manual link
    await expect(page.getByText("Saved to Files")).toBeVisible();
    await expect(page.getByRole("link", { name: /view in files/i })).toBeVisible();
    // The manual save button is suppressed: it would create a duplicate copy
    await expect(page.getByRole("button", { name: /save to files/i })).toHaveCount(0);

    // Library now holds BOTH the original and the edited copy
    const searchTerm = filename.replace(".png", "");
    await expect
      .poll(async () => (await listLibraryIds(page, searchTerm)).length, { timeout: 10_000 })
      .toBe(2);
    expect(await listLibraryIds(page, searchTerm)).toContain(originalId);
  });

  test("overwrite replaces the original in the library list", async ({ loggedInPage: page }) => {
    const filename = `lsm-overwrite-${Date.now()}.png`;
    const originalId = await seedLibraryFile(page, filename);

    await importIntoResize(page, filename);

    await page.getByRole("radio", { name: /overwrite the original/i }).check();

    await processResize(page);

    // Only the superseding version remains listed; it links back to the original
    const searchTerm = filename.replace(".png", "");
    await expect
      .poll(async () => (await listLibraryIds(page, searchTerm)).length, { timeout: 10_000 })
      .toBe(1);
    const [survivorId] = await listLibraryIds(page, searchTerm);
    expect(survivorId).not.toBe(originalId);

    const detailRes = await page.request.get(`/api/v1/files/${survivorId}`, {
      headers: await authHeaders(page),
    });
    expect(detailRes.ok()).toBeTruthy();
    const detail = await detailRes.json();
    expect(detail.file.version).toBe(2);
    expect(detail.file.parentId).toBe(originalId);
  });

  test("plain uploads show no save-mode choice", async ({ loggedInPage: page }) => {
    await page.goto("/image/resize");
    await uploadTestImage(page);

    await expect(page.getByText(/test-image/i).first()).toBeVisible();
    await expect(page.getByText("This file is from your Files")).not.toBeVisible();
  });
});
