import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Homepage answers to what visitors were looking for (#5011): is it free, how
 * do I log in after the Docker command, where are the common jobs, and the
 * short FAQ near the top instead of below the enterprise pitch.
 */

const DIST = path.resolve(__dirname, "../../apps/landing/dist");

test.describe("homepage first screens", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
  });

  test("says it's free right under the install command, within two screens", async ({ page }) => {
    const free = page.getByText(/Free and open source under AGPLv3, with every tool included\./);
    await expect(free).toBeVisible();
    await expect(free).toContainText("SAML SSO");

    const docker = page.locator("#hero-docker-copy");
    for (const el of [free, docker]) {
      const box = await el.boundingBox();
      if (!box) throw new Error("element has no layout box");
      expect(box.y + box.height).toBeLessThan(900 * 2);
    }
  });

  test("shows where to sign in next to the Docker command", async ({ page }) => {
    const hint = page.getByTestId("hero-login-hint");
    await expect(hint).toHaveText(
      "Then open http://localhost:1349 and sign in with admin / admin (you'll be asked to change it).",
    );
    await expect(hint.locator("code")).toHaveText(["http://localhost:1349", "admin / admin"]);
  });

  test("links the six most-used jobs under the search, in order", async ({ page }) => {
    const links = page.getByTestId("hero-top-jobs").getByRole("link");
    await expect(links).toHaveCount(6);
    const hrefs = await links.evaluateAll((els) => els.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual([
      "/tools/image/remove-background/",
      "/tools/pdf/compress-pdf/",
      "/tools/image/convert/",
      "/tools/image/resize/",
      "/tools/pdf/merge-pdf/",
      "/tools/image/ocr/",
    ]);
    for (const href of hrefs) {
      expect(fs.existsSync(path.join(DIST, href ?? "", "index.html")), String(href)).toBe(true);
    }
  });

  test("puts the short FAQ right after the hero, honest about telemetry", async ({ page }) => {
    const faq = page.locator("#quick-answers");
    await expect(faq.getByText("Is SnapOtter really free?")).toBeVisible();
    await expect(faq.getByText("Does SnapOtter collect any analytics?")).toBeVisible();
    await expect(faq.getByText("What hardware does it need?")).toBeVisible();
    await expect(faq).toContainText("PostHog");
    await expect(faq).toContainText("Sentry");
    await expect(faq).not.toContainText(/no tracking/i);
    await expect(faq.getByRole("link", { name: "All questions" })).toHaveAttribute("href", "/faq/");

    const order = await page
      .locator("main > section, main > div")
      .evaluateAll((els) => els.map((el) => el.id).filter(Boolean));
    for (const id of ["quick-answers", "pricing", "enterprise"]) expect(order).toContain(id);
    expect(order.indexOf("quick-answers")).toBeLessThan(order.indexOf("pricing"));
    expect(order.indexOf("pricing")).toBeLessThan(order.indexOf("enterprise"));
  });

  test("pricing leads with the free edition", async ({ page }) => {
    await expect(page.locator("#pricing")).toContainText(
      "Every tool is free and open source. A paid license only adds enterprise admin features",
    );
  });
});

test("localized homepages carry the new strings, not English fallbacks", async ({ page }) => {
  await page.goto("/de/");
  await expect(page.getByTestId("hero-login-hint")).toContainText("melde dich mit");
  await expect(page.getByTestId("hero-login-hint").locator("code").first()).toHaveText(
    "http://localhost:1349",
  );
  await expect(page.getByText(/Kostenlos und Open Source unter AGPLv3/)).toBeVisible();
  await expect(page.locator("#quick-answers")).toContainText("Welche Hardware wird benötigt?");
});

test.describe("mobile menu", () => {
  test("is a real button that opens, closes and swaps its icon", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Toggle menu" });
    const panel = page.locator("#mobile-menu");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(toggle.locator(".menu-close")).toBeVisible();
    await expect(toggle.locator(".menu-open")).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(toggle.locator(".menu-open")).toBeVisible();
  });

  test("opens from the keyboard", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle menu" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#mobile-menu")).toBeVisible();
  });
});
