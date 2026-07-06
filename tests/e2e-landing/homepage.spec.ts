import { expect, test } from "@playwright/test";

test.describe("Landing Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads with self-hosted title", async ({ page }) => {
    await expect(page).toHaveTitle(
      /SnapOtter \| Self-Hosted File Processing for Privacy-Sensitive Teams/,
    );
  });

  test("navbar renders brand and navigation links", async ({ page }) => {
    await expect(page.getByText("SnapOtter").first()).toBeVisible();
    for (const name of ["Features", "Enterprise", "Pricing", "Docs", "Talk to a human"]) {
      await expect(page.getByRole("link", { name }).first()).toBeVisible();
    }
  });

  test("navbar renders Book a Demo CTA", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Book a Demo" }).first()).toBeVisible();
  });

  test("hero renders the headline", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("File processing for privacy-sensitive teams.");
  });

  test("hero renders the subtitle", async ({ page }) => {
    await expect(
      page.getByText("Run image, video, audio, PDF, and file tools with local AI"),
    ).toBeVisible();
  });

  test("hero renders trust badges", async ({ page }) => {
    for (const badge of ["Self-hosted", "Open source", "Air-gap capable", "Compliance-friendly"]) {
      await expect(page.getByText(badge, { exact: true }).first()).toBeVisible();
    }
  });

  test("hero tool search renders", async ({ page }) => {
    await expect(page.getByPlaceholder("Search tools")).toBeVisible();
  });

  test("hero modality cards render", async ({ page }) => {
    const cards = ["Image Tools", "Video Tools", "Audio Tools", "PDF & Documents", "File Tools"];
    for (const card of cards) {
      await expect(page.getByText(card, { exact: true }).first()).toBeVisible();
    }
  });

  test("trust signals show stats", async ({ page }) => {
    await expect(page.getByText("Processing Tools")).toBeVisible();
    await expect(page.getByText("GitHub Stars")).toBeVisible();
    await expect(page.getByText("Image Pulls")).toBeVisible();
    await expect(page.getByText("Languages", { exact: true })).toBeVisible();
  });

  test("tool catalog section renders heading and browse link", async ({ page }) => {
    await expect(page.getByText("One platform. Every file workflow.")).toBeVisible();
    await expect(page.getByLabel("Search landing tools")).toBeVisible();
    await expect(page.getByRole("button", { name: "Optimize delivery" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Request a tool/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse full tool catalog" })).toBeVisible();
  });

  test("tool command center searches, filters, and links missing requests", async ({ page }) => {
    const search = page.getByLabel("Search landing tools");

    await search.fill("mp4 to mp3");
    await expect(
      page.locator("#tool-command-results").getByRole("link", { name: /MP4 to MP3/ }),
    ).toBeVisible();
    await expect(page.getByText("Recommended tools")).toBeVisible();

    await search.fill("convert figma file to layered psd");
    await expect(page.getByText("No matching tool yet")).toBeVisible();

    const requestHref = await page.locator("#tool-command-request-empty").getAttribute("href");
    expect(requestHref).toContain("github.com/snapotter-hq/snapotter/discussions/new");
    expect(requestHref).toContain("title=Tool+request%3A+convert+figma+file+to+layered+psd");
  });

  test("tool command center shows multiple starting points for a selected modality", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Video 57/ }).click();

    const results = page.locator("#tool-command-results");
    await expect(page.getByText("Video starting points")).toBeVisible();
    await expect(page.getByText(/12 of 57 tools/)).toBeVisible();
    await expect(results.getByRole("link", { name: /Convert Video/ })).toBeVisible();
    await expect(results.getByRole("link", { name: /Compress Video/ })).toBeVisible();
    await expect(results.getByRole("link", { name: /Trim Video/ })).toBeVisible();
  });

  test("enterprise section renders eyebrow and feature cards", async ({ page }) => {
    await expect(page.getByText("Built for enterprise deployment.")).toBeVisible();
    await expect(page.getByText("Enterprise-grade security")).toBeVisible();
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

  test("regulated-environments section renders heading and features", async ({ page }) => {
    await expect(page.getByText("Built for regulated environments.")).toBeVisible();
    await expect(page.getByText("Compliant by architecture")).toBeVisible();
    await expect(page.getByText("AI processing without external APIs")).toBeVisible();
    await expect(page.getByText("Fits your infrastructure")).toBeVisible();
  });

  test("pricing section renders both plans", async ({ page }) => {
    await expect(page.getByText("Free for everyone. Enterprise when you need it.")).toBeVisible();
    await expect(page.getByText("Open Source", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Enterprise", { exact: true }).first()).toBeVisible();
  });

  test("open-source section renders with GitHub link", async ({ page }) => {
    await expect(page.getByText("Open source. Fully auditable.")).toBeVisible();
    const ghLink = page.getByRole("link", { name: "Star on GitHub" }).first();
    await expect(ghLink).toHaveAttribute("href", "https://github.com/snapotter-hq/snapotter");
  });

  test("footer renders all column titles", async ({ page }) => {
    for (const col of ["Product", "Solutions", "Resources", "Community", "Legal"]) {
      await expect(page.getByText(col, { exact: true })).toBeVisible();
    }
  });

  test("footer renders copyright with current year", async ({ page }) => {
    const year = new Date().getFullYear();
    await expect(page.getByText(new RegExp(`${year}.*Chocolate Wafers`))).toBeVisible();
  });
});
