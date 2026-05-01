import { expect, test } from "@playwright/test";

test.describe("Docs Sidebar - Guide Section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/guide/getting-started");
  });

  test("sidebar renders all guide links", async ({ page }) => {
    const sidebar = page.locator(".VPSidebar, aside");
    const guideLinks = [
      "Getting started",
      "Architecture",
      "Configuration",
      "Database",
      "Deployment",
      "Docker tags",
      "Developer guide",
      "Translation guide",
      "Contributing",
    ];
    for (const linkText of guideLinks) {
      await expect(sidebar.getByText(linkText, { exact: true }).first()).toBeVisible();
    }
  });

  test("sidebar renders API reference links", async ({ page }) => {
    const sidebar = page.locator(".VPSidebar, aside");
    await expect(sidebar.getByText("REST API", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("Image engine", { exact: true })).toBeVisible();
    await expect(sidebar.getByText("AI engine", { exact: true })).toBeVisible();
  });

  test("clicking Architecture navigates correctly", async ({ page }) => {
    await page.locator(".VPSidebar a, aside a").filter({ hasText: "Architecture" }).click();
    await expect(page).toHaveURL(/\/guide\/architecture/);
    await expect(page.getByRole("heading", { name: /Architecture/ }).first()).toBeVisible();
  });

  test("clicking Configuration navigates correctly", async ({ page }) => {
    await page.locator(".VPSidebar a, aside a").filter({ hasText: "Configuration" }).click();
    await expect(page).toHaveURL(/\/guide\/configuration/);
  });

  test("clicking Deployment navigates correctly", async ({ page }) => {
    await page.locator(".VPSidebar a, aside a").filter({ hasText: "Deployment" }).first().click();
    await expect(page).toHaveURL(/\/guide\/deployment/);
  });
});

test.describe("Docs Sidebar - API Reference Section", () => {
  test("clicking REST API navigates correctly", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await page.locator(".VPSidebar a, aside a").filter({ hasText: "REST API" }).click();
    await expect(page).toHaveURL(/\/api\/rest/);
    await expect(page.getByText("REST API Reference")).toBeVisible();
  });

  test("clicking Image engine navigates correctly", async ({ page }) => {
    await page.goto("/api/rest");
    await page.locator(".VPSidebar a, aside a").filter({ hasText: "Image engine" }).click();
    await expect(page).toHaveURL(/\/api\/image-engine/);
  });

  test("clicking AI engine navigates correctly", async ({ page }) => {
    await page.goto("/api/rest");
    await page.locator(".VPSidebar a, aside a").filter({ hasText: "AI engine" }).click();
    await expect(page).toHaveURL(/\/api\/ai/);
  });
});
