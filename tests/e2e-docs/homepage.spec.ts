import { expect, test } from "@playwright/test";

test.describe("Docs Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads with correct title", async ({ page }) => {
    await expect(page).toHaveTitle(/SnapOtter/);
  });

  test("hero renders site name and tagline", async ({ page }) => {
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
    await expect(page.getByText("A Self Hosted Image Manipulator")).toBeVisible();
    await expect(
      page.getByText("47 tools. Local AI. No cloud. Your images stay on your machine."),
    ).toBeVisible();
  });

  test("hero renders action buttons", async ({ page }) => {
    const getStarted = page.getByRole("link", { name: "Get started", exact: true });
    await expect(getStarted).toBeVisible();
    await expect(getStarted).toHaveAttribute("href", /getting-started/);

    const apiRef = page.getByRole("link", { name: "API reference", exact: true });
    await expect(apiRef).toBeVisible();
    await expect(apiRef).toHaveAttribute("href", /\/api\/rest/);
  });

  test("features section renders all 6 feature cards", async ({ page }) => {
    const features = [
      "47 Image Tools",
      "Local AI",
      "Pipelines",
      "REST API",
      "File Library",
      "Teams & Access Control",
    ];
    for (const feature of features) {
      await expect(page.getByRole("heading", { name: feature }).first()).toBeVisible();
    }
  });

  test("Docker quick-start code block is visible", async ({ page }) => {
    await expect(page.getByText("docker run", { exact: false }).first()).toBeVisible();
  });
});

test.describe("Docs Navbar", () => {
  test("renders nav links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Guide" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "API Reference" }).first()).toBeVisible();
  });

  test("Guide nav link navigates to getting-started", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Guide" }).first().click();
    await expect(page).toHaveURL(/getting-started/);
    await expect(page.getByRole("heading", { name: "Getting Started" })).toBeVisible();
  });

  test("API Reference nav link navigates to REST API", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "API Reference" }).first().click();
    await expect(page).toHaveURL(/\/api\/rest/);
    await expect(page.getByText("REST API Reference")).toBeVisible();
  });

  test("logo links back to homepage", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await page.locator(".VPNavBarTitle a, .title a").first().click();
    await expect(page).toHaveURL("/");
  });
});
