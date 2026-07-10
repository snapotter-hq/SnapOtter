import { expect, test } from "@playwright/test";

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
    await expect(page.getByRole("link", { name: "Enterprise" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Pricing" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Docs" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Talk to a human" }).last()).toBeVisible();
  });
});
