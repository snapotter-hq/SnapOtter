import { expect, test } from "@playwright/test";

test.describe("Landing Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads with correct title", async ({ page }) => {
    await expect(page).toHaveTitle(/SnapOtter/);
  });

  test("navbar renders brand and navigation links", async ({ page }) => {
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Features" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Pricing" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Docs" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact" }).first()).toBeVisible();
  });

  test("navbar renders Book a Demo CTA", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Book a Demo" }).first()).toBeVisible();
  });

  test("hero section renders headline and subheadline", async ({ page }) => {
    await expect(page.getByText("Your images. Stay yours.")).toBeVisible();
    await expect(
      page.getByText("The open-source, self-hosted image processing platform."),
    ).toBeVisible();
  });

  test("hero CTA links to GitHub", async ({ page }) => {
    const cta = page.getByRole("link", { name: "Get it for free" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "https://github.com/snapotter-hq/snapotter");
    await expect(cta).toHaveAttribute("target", "_blank");
  });

  test("how-it-works section renders Docker command", async ({ page }) => {
    await expect(page.getByText("Get started in seconds")).toBeVisible();
    await expect(
      page.getByText("docker run -d --name SnapOtter", { exact: false }),
    ).toBeVisible();
  });

  test("why-choose section renders all 9 benefit cards", async ({ page }) => {
    await expect(page.getByText("Built different. On purpose.")).toBeVisible();
    const cards = [
      "No Signup", "No Uploads", "Forever Free", "No Limits",
      "Batch Processing", "Lightning Fast", "Open Source", "REST API",
      "Pipeline Automation",
    ];
    for (const card of cards) {
      await expect(page.getByText(card, { exact: true }).first()).toBeVisible();
    }
  });

  test("bento grid renders with search and tool count", async ({ page }) => {
    await expect(page.getByText("47 tools. Zero cloud dependency.")).toBeVisible();
    await expect(page.getByPlaceholder("Search tools...")).toBeVisible();
    await expect(page.getByText(/Showing 47 of 47 tools/)).toBeVisible();
  });

  test("enterprise section renders feature cards", async ({ page }) => {
    await expect(page.getByText("Your data never leaves your network.")).toBeVisible();
    await expect(page.getByText("Data Sovereignty")).toBeVisible();
    await expect(page.getByText("Enterprise Controls")).toBeVisible();
    await expect(page.getByText("Deploy Anywhere")).toBeVisible();
  });

  test("pricing section renders both plans", async ({ page }) => {
    await expect(page.getByText(/Free for everyone/)).toBeVisible();
    const openSource = page.getByText("Open Source", { exact: true });
    await expect(openSource.first()).toBeVisible();
    await expect(page.getByText("Enterprise", { exact: true }).first()).toBeVisible();
  });

  test("open-source section renders with GitHub link", async ({ page }) => {
    await expect(page.getByText("Open source. Always.")).toBeVisible();
    const ghLink = page.getByRole("link", { name: "Star on GitHub" }).first();
    await expect(ghLink).toHaveAttribute("href", "https://github.com/snapotter-hq/snapotter");
  });

  test("footer renders all column titles", async ({ page }) => {
    await expect(page.getByText("Product", { exact: true })).toBeVisible();
    await expect(page.getByText("Resources", { exact: true })).toBeVisible();
    await expect(page.getByText("Community", { exact: true })).toBeVisible();
    await expect(page.getByText("Legal", { exact: true })).toBeVisible();
  });

  test("footer renders copyright with current year", async ({ page }) => {
    const year = new Date().getFullYear();
    await expect(page.getByText(new RegExp(String(year)))).toBeVisible();
  });
});
