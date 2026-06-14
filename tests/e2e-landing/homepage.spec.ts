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
    await expect(page.getByRole("link", { name: "Enterprise" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Pricing" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Docs" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Contact" }).first()).toBeVisible();
  });

  test("navbar renders Book a Demo CTA", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Book a Demo" }).first()).toBeVisible();
  });

  test("hero section renders headline and subheadline", async ({ page }) => {
    await expect(page.getByText("Your files never leave")).toBeVisible();
    await expect(
      page.getByText("self-hosted tools for images, video, audio, documents, and data"),
    ).toBeVisible();
  });

  test("hero CTA links to getting started docs", async ({ page }) => {
    const cta = page.getByRole("link", { name: "Deploy Free" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "https://docs.snapotter.com/guide/getting-started");
    await expect(cta).toHaveAttribute("target", "_blank");
  });

  test("hero section renders Docker command", async ({ page }) => {
    await expect(
      page.getByText("docker run -d -p 1349:1349 snapotter/snapotter", { exact: false }),
    ).toBeVisible();
  });

  test("trust signals show stats", async ({ page }) => {
    await expect(page.getByText("Processing Tools")).toBeVisible();
    await expect(page.getByText("GitHub Stars")).toBeVisible();
    await expect(page.getByText("Docker Pulls")).toBeVisible();
    await expect(page.getByText("Languages")).toBeVisible();
  });

  test("modality explorer renders section heading and cards", async ({ page }) => {
    await expect(page.getByText("Every file format. One platform.")).toBeVisible();
    const modalities = ["Image", "Video", "Audio", "Documents", "Data"];
    for (const mod of modalities) {
      await expect(page.getByText(mod, { exact: true }).first()).toBeVisible();
    }
  });

  test("feature highlights section renders heading and features", async ({ page }) => {
    await expect(page.getByText("Built for serious infrastructure.")).toBeVisible();
    await expect(page.getByText("Your files stay on your servers")).toBeVisible();
    await expect(page.getByText("Full REST API for every tool")).toBeVisible();
    await expect(page.getByText("15 AI models, all running locally")).toBeVisible();
    await expect(page.getByText("Deploy once, use everywhere")).toBeVisible();
  });

  test("enterprise section renders feature cards", async ({ page }) => {
    await expect(page.getByText("Built for enterprise deployment.")).toBeVisible();
    const features = [
      "SAML SSO",
      "SCIM Provisioning",
      "Multi-Factor Auth",
      "Multi-Tenancy",
      "Per-Tool Permissions",
      "Audit Export",
      "S3-Compatible Storage",
      "Webhooks",
    ];
    for (const feature of features) {
      await expect(page.getByText(feature, { exact: true }).first()).toBeVisible();
    }
  });

  test("how-it-works section renders steps", async ({ page }) => {
    await expect(page.getByText("Up and running in 60 seconds.")).toBeVisible();
    await expect(page.getByText("Run a single Docker command", { exact: false })).toBeVisible();
    await expect(page.getByText("Navigate to localhost:1349", { exact: false })).toBeVisible();
    await expect(page.getByText("Upload files, pick a tool", { exact: false })).toBeVisible();
  });

  test("pricing section renders both plans", async ({ page }) => {
    await expect(page.getByText("Free for everyone. Enterprise when you need it.")).toBeVisible();
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
    await expect(page.getByText("Solutions", { exact: true })).toBeVisible();
    await expect(page.getByText("Resources", { exact: true })).toBeVisible();
    await expect(page.getByText("Community", { exact: true })).toBeVisible();
    await expect(page.getByText("Legal", { exact: true })).toBeVisible();
  });

  test("footer renders copyright with current year", async ({ page }) => {
    const year = new Date().getFullYear();
    await expect(page.getByText(new RegExp(`${year}.*Chocolate Wafers`))).toBeVisible();
  });
});
