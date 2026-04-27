import { expect, test } from "@playwright/test";

test.describe("Guide Content Rendering", () => {
  test("getting-started page renders Docker quick start", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await expect(page.getByRole("heading", { name: /Getting Started/ })).toBeVisible();
    await expect(page.getByText("Quick Start")).toBeVisible();
    await expect(page.getByText("docker run", { exact: false }).first()).toBeVisible();
  });

  test("getting-started page renders tip boxes", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await expect(page.locator(".tip, .custom-block.tip").first()).toBeVisible();
  });

  test("architecture page renders content", async ({ page }) => {
    await page.goto("/guide/architecture");
    await expect(page.getByRole("heading", { name: /Architecture/ }).first()).toBeVisible();
  });

  test("configuration page renders content", async ({ page }) => {
    await page.goto("/guide/configuration");
    await expect(
      page.getByRole("heading", { name: /Configuration/ }).first(),
    ).toBeVisible();
  });

  test("deployment page renders content", async ({ page }) => {
    await page.goto("/guide/deployment");
    await expect(page.getByRole("heading", { name: /Deployment/ }).first()).toBeVisible();
  });

  test("contributing page renders content", async ({ page }) => {
    await page.goto("/guide/contributing");
    await expect(
      page.getByRole("heading", { name: /Contributing/ }).first(),
    ).toBeVisible();
  });
});

test.describe("API Reference Content Rendering", () => {
  test("REST API page renders authentication section", async ({ page }) => {
    await page.goto("/api/rest");
    await expect(page.getByText("REST API Reference")).toBeVisible();
    await expect(page.getByText("Authentication").first()).toBeVisible();
  });

  test("REST API page renders code blocks", async ({ page }) => {
    await page.goto("/api/rest");
    const codeBlocks = page.locator("pre code, div[class*='language-']");
    const count = await codeBlocks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("image-engine page renders content", async ({ page }) => {
    await page.goto("/api/image-engine");
    await expect(
      page.getByRole("heading", { name: /Image engine|Image Engine/ }).first(),
    ).toBeVisible();
  });

  test("AI engine page renders content", async ({ page }) => {
    await page.goto("/api/ai");
    await expect(
      page.getByRole("heading", { name: /AI engine|AI Engine/ }).first(),
    ).toBeVisible();
  });
});

test.describe("Edit Links", () => {
  test("guide pages show Edit this page on GitHub link", async ({ page }) => {
    await page.goto("/guide/getting-started");
    const editLink = page.getByRole("link", { name: /Edit this page on GitHub/ });
    await expect(editLink).toBeVisible();
    await expect(editLink).toHaveAttribute(
      "href",
      /github\.com\/snapotter-hq\/snapotter\/edit\/main\/apps\/docs/,
    );
  });
});

test.describe("Docs Footer", () => {
  test("footer renders AGPLv3 license link", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await expect(page.getByText(/AGPLv3 License/)).toBeVisible();
  });

  test("footer renders llms.txt links", async ({ page }) => {
    await page.goto("/guide/getting-started");
    await expect(page.getByRole("link", { name: "/llms.txt" })).toBeVisible();
    await expect(page.getByRole("link", { name: "/llms-full.txt" })).toBeVisible();
  });
});
