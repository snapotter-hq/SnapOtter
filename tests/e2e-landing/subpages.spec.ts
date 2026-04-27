import { expect, test } from "@playwright/test";

test.describe("Contact Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact");
  });

  test("renders the page heading", async ({ page }) => {
    await expect(page.getByText("Get in touch")).toBeVisible();
  });

  test("renders all form fields", async ({ page }) => {
    await expect(page.getByLabel(/Name/)).toBeVisible();
    await expect(page.getByLabel(/Email/)).toBeVisible();
    await expect(page.getByLabel(/Company/)).toBeVisible();
    await expect(page.getByLabel(/Subject/)).toBeVisible();
    await expect(page.getByLabel(/Message/)).toBeVisible();
    await expect(page.getByText("Send Message")).toBeVisible();
  });

  test("renders benefit cards", async ({ page }) => {
    await expect(page.getByText("Live Demo")).toBeVisible();
    await expect(page.getByText("Deployment Support")).toBeVisible();
  });

  test("renders email fallback", async ({ page }) => {
    const emailLink = page.getByRole("link", { name: "contact@snapotter.com" });
    await expect(emailLink).toBeVisible();
    await expect(emailLink).toHaveAttribute("href", "mailto:contact@snapotter.com");
  });
});

test.describe("Privacy Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/privacy");
  });

  test("renders the page heading", async ({ page }) => {
    await expect(page.getByText("Privacy Policy")).toBeVisible();
  });

  test("renders all section headings", async ({ page }) => {
    const headings = [
      "Overview", "Website (snapotter.com)", "Self-Hosted Software",
      "Optional Analytics", "Contact Form", "Open Source", "Changes", "Contact",
    ];
    for (const heading of headings) {
      await expect(page.getByText(heading, { exact: true })).toBeVisible();
    }
  });

  test("renders the contact email", async ({ page }) => {
    const emailLink = page.getByRole("link", { name: "contact@snapotter.com" });
    await expect(emailLink).toBeVisible();
  });
});

test.describe("Terms Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/terms");
  });

  test("renders the page heading", async ({ page }) => {
    await expect(page.getByText("Terms and Conditions")).toBeVisible();
  });

  test("renders all section headings", async ({ page }) => {
    const headings = [
      "Overview", "Software License", "Website Use", "Self-Hosted Software",
      "Intellectual Property", "Limitation of Liability", "Changes", "Contact",
    ];
    for (const heading of headings) {
      await expect(page.getByText(heading, { exact: true })).toBeVisible();
    }
  });

  test("mentions AGPL-3.0 license", async ({ page }) => {
    await expect(page.getByText(/AGPL-3.0/).first()).toBeVisible();
  });
});

test.describe("Cross-Page Navigation", () => {
  test("footer Privacy Policy link navigates to /privacy", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL("/privacy");
    await expect(page.getByText("Privacy Policy").first()).toBeVisible();
  });

  test("footer Terms link navigates to /terms", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Terms and Conditions" }).click();
    await expect(page).toHaveURL("/terms");
    await expect(page.getByText("Terms and Conditions").first()).toBeVisible();
  });

  test("footer FAQ link navigates to /faq", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "FAQ" }).click();
    await expect(page).toHaveURL("/faq");
    await expect(page.getByText("Frequently Asked Questions")).toBeVisible();
  });

  test("navbar Contact link navigates to /contact", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Contact" }).first().click();
    await expect(page).toHaveURL("/contact");
    await expect(page.getByText("Get in touch")).toBeVisible();
  });

  test("pricing Contact Sales links to /contact", async ({ page }) => {
    await page.goto("/");
    const contactSales = page.getByRole("link", { name: /Contact Sales/ });
    await expect(contactSales).toHaveAttribute("href", "/contact");
  });
});
