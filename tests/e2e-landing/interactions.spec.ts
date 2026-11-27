import { expect, type Page, test } from "@playwright/test";

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
    await expect(page.getByRole("link", { name: "Developers" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Enterprise" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Pricing" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Docs" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Talk to a human" }).last()).toBeVisible();
  });
});

test.describe("Product Menu", () => {
  const productButton = (page: Page) =>
    page.locator("[data-product-menu]").getByRole("button", { name: "Product" });
  const developersLink = (page: Page) =>
    page.locator("#product-menu").getByRole("link", { name: /Developers/ });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // dispatchEvent clicks without moving focus or the pointer, which is what a
  // mouse click in Safari does to a button (#5080).
  test("a click opens the menu without focus or hover", async ({ page }) => {
    await expect(developersLink(page)).toBeHidden();
    await productButton(page).dispatchEvent("click");
    await expect(productButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(developersLink(page)).toBeVisible();
  });

  test("a second click closes it", async ({ page }) => {
    await productButton(page).dispatchEvent("click");
    await expect(developersLink(page)).toBeVisible();
    await productButton(page).dispatchEvent("click");
    await expect(productButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(developersLink(page)).toBeHidden();
  });

  test("Escape closes it and moves focus back to the button", async ({ page }) => {
    await productButton(page).click();
    await page.mouse.move(0, 400);
    await developersLink(page).focus();
    await page.keyboard.press("Escape");
    await expect(productButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(developersLink(page)).toBeHidden();
    await expect(productButton(page)).toBeFocused();
  });

  test("a click outside closes it", async ({ page }) => {
    await productButton(page).dispatchEvent("click");
    await expect(developersLink(page)).toBeVisible();
    await page.locator("h1").first().click();
    await expect(productButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(developersLink(page)).toBeHidden();
  });

  test("hover still opens it", async ({ page }) => {
    await productButton(page).hover();
    await expect(developersLink(page)).toBeVisible();
    await expect(productButton(page)).toHaveAttribute("aria-expanded", "false");
  });

  // WCAG 1.4.13: hover content must be dismissible without moving the pointer (#5183).
  test("Escape hides a hover-opened menu until the pointer leaves", async ({ page }) => {
    await productButton(page).hover();
    await expect(developersLink(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(developersLink(page)).toBeHidden();
    await page.mouse.move(0, 400);
    await productButton(page).hover();
    await expect(developersLink(page)).toBeVisible();
  });

  test("a click reopens a menu dismissed with Escape while hovered", async ({ page }) => {
    await productButton(page).hover();
    await page.keyboard.press("Escape");
    await expect(developersLink(page)).toBeHidden();
    await productButton(page).click();
    await expect(productButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(developersLink(page)).toBeVisible();
  });

  test("tabbing away keeps a hover-opened menu dismissed", async ({ page }) => {
    await productButton(page).hover();
    await productButton(page).focus();
    await page.keyboard.press("Escape");
    await expect(developersLink(page)).toBeHidden();
    await page.keyboard.press("Tab");
    await expect(productButton(page)).not.toBeFocused();
    await expect(developersLink(page)).toBeHidden();
  });

  // The panel is a list of links, so the button is a disclosure, not a menu button (#5183).
  test("the button announces as a disclosure", async ({ page }) => {
    await expect(productButton(page)).not.toHaveAttribute("aria-haspopup");
    await expect(productButton(page)).toHaveAttribute("aria-controls", "product-menu");
  });

  test("keyboard users can open it and tab into the links", async ({ page }) => {
    await productButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(productButton(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(developersLink(page)).toBeFocused();
  });
});
