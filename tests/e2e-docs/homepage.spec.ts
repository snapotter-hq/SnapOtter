import { expect, test } from "@playwright/test";

test.describe("docs homepage (Two Doors)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("title contains SnapOtter", async ({ page }) => {
    await expect(page).toHaveTitle(/SnapOtter/);
  });

  test("hero renders name and value prop", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "SnapOtter Documentation" })).toBeVisible();
    await expect(
      page.getByText("self-hosted file-processing infrastructure", { exact: false }),
    ).toBeVisible();
  });

  test("hero shows the quick-start docker command", async ({ page }) => {
    await expect(page.getByText("docker run", { exact: false }).first()).toBeVisible();
  });

  test("renders both audience doors and a sample link in each", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Self-hosting" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enterprise" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Quick start" })).toBeVisible();
    await expect(page.getByRole("link", { name: "SCIM provisioning" })).toBeVisible();
  });

  test("door CTAs lead to getting started and the enterprise page", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Start self-hosting" })).toHaveAttribute(
      "href",
      "/guide/getting-started",
    );
    await expect(page.getByRole("link", { name: "See enterprise features" })).toHaveAttribute(
      "href",
      "https://snapotter.com/enterprise",
    );
  });

  test("renders the modality strip with counts", async ({ page }) => {
    await expect(page.getByText("200+ tools across 5 modalities")).toBeVisible();
    await expect(page.getByRole("link", { name: /Image/ })).toBeVisible();
  });

  test("modality chips navigate to live tool pages client-side", async ({ page }) => {
    const chips = [
      { label: /^Image/, href: "/tools/image/resize" },
      { label: /^Video/, href: "/tools/video/convert-video" },
      { label: /^Audio/, href: "/tools/audio/convert-audio" },
      { label: /^PDF/, href: "/tools/pdf/merge-pdf" },
      { label: /^Files/, href: "/tools/files/chart-maker" },
    ];
    for (const chip of chips) {
      await expect(page.getByRole("link", { name: chip.label })).toHaveAttribute("href", chip.href);
    }
    // Click through one chip: SPA navigation bypasses the _redirects shim,
    // so a stale href 404s here even though a full page load would redirect.
    await page.getByRole("link", { name: /^Image/ }).click();
    await expect(page).toHaveURL(/\/tools\/image\/resize/);
    await expect(page.getByRole("heading", { level: 1, name: "Resize Image" })).toBeVisible();
  });

  test("nav links work", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Guide" }).first()).toBeVisible();
    await page.getByRole("link", { name: "Guide" }).first().click();
    await expect(page.getByRole("heading", { name: "Getting Started" })).toBeVisible();
  });
});
