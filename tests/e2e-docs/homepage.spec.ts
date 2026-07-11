import { expect, test } from "@playwright/test";

test.describe("docs homepage (Two Doors)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("title contains SnapOtter", async ({ page }) => {
    await expect(page).toHaveTitle(/SnapOtter/);
  });

  test("hero renders name and value prop", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "SnapOtter Documentation" })).toBeVisible();
    await expect(
      page.getByText("self-hosted file-processing infrastructure", { exact: false }),
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

  test("door CTAs lead to getting started and the enterprise page", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Start self-hosting" })).toHaveAttribute(
      "href",
      "/guide/getting-started",
    );
    await expect(page.getByRole("link", { name: "See enterprise features" })).toHaveAttribute(
      "href",
      "https://snapotter.com/enterprise",
    );
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
