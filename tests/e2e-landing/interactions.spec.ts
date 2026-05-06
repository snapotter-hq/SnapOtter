import { expect, test } from "@playwright/test";

test.describe("BentoGrid Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("search filters tools by name", async ({ page }) => {
    const input = page.getByPlaceholder("Search tools...");
    await input.fill("resize");
    await expect(page.getByText("Resize", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Showing \d+ of 48 tools/)).toBeVisible();
  });

  test("category pill filters tools", async ({ page }) => {
    await page.getByText(/AI Tools/).click();
    await expect(page.getByText(/Showing 15 of 48 tools/)).toBeVisible();
    await expect(page.getByText("Remove Background")).toBeVisible();
  });

  test("clicking All resets category filter", async ({ page }) => {
    await page.getByText(/AI Tools/).click();
    await expect(page.getByText(/Showing 15 of 48 tools/)).toBeVisible();

    await page.getByText(/All \(48\)/).click();
    await expect(page.getByText(/Showing 48 of 48 tools/)).toBeVisible();
  });

  test("search with no results shows empty state", async ({ page }) => {
    const input = page.getByPlaceholder("Search tools...");
    await input.fill("xyznonexistent");
    await expect(page.getByText("No tools found. Try a different search.")).toBeVisible();
    await expect(page.getByText(/Showing 0 of 48 tools/)).toBeVisible();
  });

  test("combined search and category filter works", async ({ page }) => {
    await page.getByText(/AI Tools/).click();
    const input = page.getByPlaceholder("Search tools...");
    await input.fill("background");
    await expect(page.getByText("Remove Background")).toBeVisible();
  });
});

test.describe("HowItWorks Copy Button", () => {
  test("copy button shows Copied! feedback", async ({ page }) => {
    await page.goto("/");
    const copyButton = page.locator("button").filter({ hasText: "docker run" });
    await copyButton.click();
    await expect(page.getByText("Copied!")).toBeVisible();
  });
});

test.describe("FAQ Page Accordion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/faq");
  });

  test("renders all FAQ questions", async ({ page }) => {
    await expect(page.getByText("Frequently Asked Questions")).toBeVisible();
    await expect(page.getByText("Are my files safe and private?")).toBeVisible();
    await expect(page.getByText("Is SnapOtter really free?")).toBeVisible();
    await expect(page.getByText("Do I need an internet connection?")).toBeVisible();
  });

  test("answers are hidden by default", async ({ page }) => {
    await expect(page.getByText(/All processing happens on your own server/)).not.toBeVisible();
  });

  test("clicking a question expands the answer", async ({ page }) => {
    await page.getByText("Are my files safe and private?").click();
    await expect(page.getByText(/All processing happens on your own server/)).toBeVisible();
  });

  test("clicking again collapses the answer", async ({ page }) => {
    const question = page.getByText("Are my files safe and private?");
    await question.click();
    await expect(page.getByText(/All processing happens on your own server/)).toBeVisible();
    await question.click();
    await expect(page.getByText(/All processing happens on your own server/)).not.toBeVisible();
  });

  test("multiple FAQs can be open simultaneously", async ({ page }) => {
    await page.getByText("Are my files safe and private?").click();
    await page.getByText("Is SnapOtter really free?").click();
    await expect(page.getByText(/All processing happens on your own server/)).toBeVisible();
    await expect(page.getByText(/open source under AGPL-3.0/)).toBeVisible();
  });
});

test.describe("Mobile Navigation", () => {
  test("hamburger menu opens and shows links", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const toggle = page.getByLabel("Toggle menu");
    await toggle.click();
    await expect(page.getByRole("link", { name: "Features" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Pricing" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Docs" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact" }).last()).toBeVisible();
  });
});
