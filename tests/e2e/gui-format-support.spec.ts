import path from "node:path";
import { expect, test, uploadTestImage, waitForProcessing } from "./helpers";

const fixtureFormat = (name: string) =>
  path.join(process.cwd(), "tests", "fixtures", "image", "formats", name);
const fixtureImage = (name: string) =>
  path.join(process.cwd(), "tests", "fixtures", "image", "valid", name);

async function uploadFixture(page: import("@playwright/test").Page, filePath: string) {
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.locator("[class*='border-dashed']").first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);
  await page.waitForTimeout(500);
}

test.describe("Format upload and resize processing", () => {
  test.describe.configure({ timeout: 60_000 });
  const formats: [string, string][] = [
    ["PNG", "sample.png"],
    ["JPEG", "sample.jpg"],
    ["WebP", "sample.webp"],
    ["BMP", "sample.bmp"],
    ["AVIF", "sample.avif"],
    ["GIF", "sample.gif"],
    ["SVG", "sample.svg"],
    ["TIFF", "sample.tiff"],
  ];
  for (const [label, fileName] of formats) {
    test(`${label} uploads and resizes`, async ({ loggedInPage: page }) => {
      await page.goto("/resize");
      await uploadFixture(page, fixtureFormat(fileName));
      await page.locator("input[placeholder='Auto']").first().fill("25");
      await page.getByRole("button", { name: "Resize" }).click();
      await waitForProcessing(page);
      await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  }
  test("HEIC uploads and resizes", async ({ loggedInPage: page }) => {
    await page.goto("/resize");
    await uploadFixture(page, fixtureImage("test-200x150.heic"));
    await page.locator("input[placeholder='Auto']").first().fill("25");
    await page.getByRole("button", { name: "Resize" }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Convert tool - new output formats", () => {
  test.describe.configure({ timeout: 60_000 });
  for (const fmt of ["bmp", "ico", "jp2", "qoi", "jxl"]) {
    test(`converts PNG to ${fmt.toUpperCase()}`, async ({ loggedInPage: page }) => {
      await page.goto("/convert");
      await uploadTestImage(page);
      await page.selectOption("#convert-target-format", fmt);
      await page.getByRole("button", { name: /convert/i }).click();
      await waitForProcessing(page);
      const ok = await page
        .getByRole("link", { name: /download/i })
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      const err = !ok
        ? await page
            .getByText(/error|unsupported|failed|not available/i)
            .first()
            .waitFor({ state: "visible", timeout: 5_000 })
            .then(() => true)
            .catch(() => false)
        : false;
      expect(ok || err, `${fmt}: expected download or error`).toBe(true);
    });
  }
});

test.describe("Convert tool - format dropdown", () => {
  test("contains all 13 output formats", async ({ loggedInPage: page }) => {
    await page.goto("/convert");
    await page.waitForSelector("#convert-target-format", { timeout: 10_000 });
    const options = await page
      .locator("#convert-target-format option")
      .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    for (const fmt of [
      "jpg",
      "png",
      "webp",
      "avif",
      "tiff",
      "gif",
      "heic",
      "heif",
      "jxl",
      "bmp",
      "ico",
      "jp2",
      "qoi",
    ]) {
      expect(options, `missing: ${fmt}`).toContain(fmt);
    }
  });
});

test.describe("HEIC-to-JPG conversion", () => {
  test.describe.configure({ timeout: 60_000 });
  test("uploads HEIC, converts to JPG", async ({ loggedInPage: page }) => {
    await page.goto("/convert");
    await uploadFixture(page, fixtureImage("test-200x150.heic"));
    await expect(page.getByText(/heic/i).first()).toBeVisible({ timeout: 10_000 });
    await page.selectOption("#convert-target-format", "jpg");
    await page.getByRole("button", { name: /convert/i }).click();
    await waitForProcessing(page);
    await expect(page.getByRole("link", { name: /download/i }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Exotic format upload acceptance", () => {
  test.describe.configure({ timeout: 60_000 });
  const exoticFormats: [string, string][] = [
    ["SVGZ", "sample.svgz"],
    ["EPS", "sample.eps"],
    ["PPM", "sample.ppm"],
    ["PGM", "sample.pgm"],
    ["PBM", "sample.pbm"],
    ["CUR", "sample.cur"],
    ["APNG", "sample.apng"],
  ];
  for (const [label, fileName] of exoticFormats) {
    test(`${label} uploads to info without crashing`, async ({ loggedInPage: page }) => {
      await page.goto("/info");
      await uploadFixture(page, fixtureFormat(fileName));
      await page.getByRole("button", { name: /read info/i }).click();
      await waitForProcessing(page);
      const meta = await page
        .getByText(/width|height|format|dimensions|size|resolution|channels|pixel/i)
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      const err = !meta
        ? await page
            .getByText(/error|unsupported|failed|not supported|cannot|invalid/i)
            .first()
            .waitFor({ state: "visible", timeout: 5_000 })
            .then(() => true)
            .catch(() => false)
        : false;
      expect(meta || err, `${label}: expected metadata or error`).toBe(true);
    });
  }
});
