import { expect, test } from "@playwright/test";

test.describe("docs homepage (Two Doors)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("title contains SnapOtter", async ({ page }) => {
    await expect(page).toHaveTitle(/SnapOtter/);
  });

  test("hero renders eyebrow, name, and value prop", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "SnapOtter Documentation" })).toBeVisible();
    await expect(page.getByText("Self-hosted", { exact: false }).first()).toBeVisible();
    await expect(
      page.getByText("running entirely on your hardware", { exact: false }),
    ).toBeVisible();
  });

  test("hero shows the quick-start docker command", async ({ page }) => {
    await expect(page.getByText("docker run", { exact: false }).first()).toBeVisible();
  });

  test("renders both audience doors and a sample link in each", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Self-hosting" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enterprise" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Quick start" })).toBeVisible();
    await expect(page.getByRole("link", { name: "SCIM provisioning" })).toBeVisible();
  });

  test("renders the modality strip with counts", async ({ page }) => {
    await expect(page.getByText("200+ tools across 5 modalities")).toBeVisible();
    await expect(page.getByRole("link", { name: /Image/ })).toBeVisible();
  });

  test("nav links work", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Guide" }).first()).toBeVisible();
    await page.getByRole("link", { name: "Guide" }).first().click();
    await expect(page.getByRole("heading", { name: "Getting Started" })).toBeVisible();
  });
});
