import { expect, test } from "@playwright/test";

const API = process.env.API_URL || "http://localhost:13490";

const LOCALES = [
  { code: "en", native: "English", dir: "ltr", sample: "Upload from computer" },
  { code: "de", native: "Deutsch", dir: "ltr", sample: "Vom Computer hochladen" },
  { code: "fr", native: "Français", dir: "ltr", sample: "Importer depuis" },
  { code: "es", native: "Español", dir: "ltr", sample: "Subir desde" },
  { code: "ja", native: "日本語", dir: "ltr", sample: "アップロード" },
  { code: "ko", native: "한국어", dir: "ltr", sample: "업로드" },
  { code: "zh-CN", native: "简体中文", dir: "ltr", sample: "上传" },
  { code: "zh-TW", native: "繁體中文", dir: "ltr", sample: "上傳" },
  { code: "ru", native: "Русский", dir: "ltr", sample: "Загрузить" },
  { code: "ar", native: "العربية", dir: "rtl", sample: "رفع" },
  { code: "pt-BR", native: "Português (Brasil)", dir: "ltr", sample: "Enviar do computador" },
  { code: "it", native: "Italiano", dir: "ltr", sample: "Carica dal computer" },
  { code: "nl", native: "Nederlands", dir: "ltr", sample: "Upload van computer" },
  { code: "sv", native: "Svenska", dir: "ltr", sample: "Ladda upp" },
  { code: "pl", native: "Polski", dir: "ltr", sample: "Prześlij" },
  { code: "uk", native: "Українська", dir: "ltr", sample: "Завантажити" },
  { code: "tr", native: "Türkçe", dir: "ltr", sample: "Bilgisayardan" },
  { code: "hi", native: "हिन्दी", dir: "ltr", sample: "अपलोड" },
  { code: "vi", native: "Tiếng Việt", dir: "ltr", sample: "Tải lên" },
  { code: "id", native: "Bahasa Indonesia", dir: "ltr", sample: "Unggah" },
  { code: "th", native: "ไทย", dir: "ltr", sample: "อัปโหลด" },
];

test.describe("i18n - API", () => {
  test("GET /api/v1/config/locale returns default locale without auth", async ({ request }) => {
    const res = await request.get(`${API}/api/v1/config/locale`);
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.defaultLocale).toBe("en");
  });
});

test.describe("i18n - locale detection", () => {
  test("defaults to English when no preference is set", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("en");
  });

  test("document.dir is set to ltr after mount", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(500);
    const dir = await page.getAttribute("html", "dir");
    expect(dir).toBe("ltr");
  });
});

test.describe("i18n - top nav language selector", () => {
  test("top nav shows Globe button with current language name", async ({ page }) => {
    await page.goto("/");
    const trigger = page.locator('button[title="Language"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText("English");
  });

  test("clicking the language button opens a dropdown with all 21 languages", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[title="Language"]').click();

    const dropdown = page.locator(".max-h-72");
    await expect(dropdown).toBeVisible();

    for (const locale of LOCALES) {
      const option = dropdown.locator("button", { hasText: locale.native });
      await expect(option).toBeVisible();
    }
  });

  test("selecting a language updates the UI", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[title="Language"]').click();
    await page.locator(".max-h-72").locator("button", { hasText: "Deutsch" }).click();

    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });
});

test.describe("i18n - locale persistence", () => {
  test("selected locale persists in localStorage", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[title="Language"]').click();
    await page.locator(".max-h-72").locator("button", { hasText: "Français" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");

    const stored = await page.evaluate(() => localStorage.getItem("snapotter-locale"));
    expect(stored).toBe("fr");
  });

  test("locale persists across page refresh", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[title="Language"]').click();
    await page.locator(".max-h-72").locator("button", { hasText: "Español" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    await page.reload();
    await page.waitForTimeout(1000);

    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("es");
  });
});

test.describe("i18n - Arabic RTL", () => {
  test("switching to Arabic sets dir=rtl", async ({ page }) => {
    await page.goto("/");
    await page.locator('button[title="Language"]').click();
    await page.locator(".max-h-72").locator("button", { hasText: "العربية" }).click();

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });
});

test.describe("i18n - login page", () => {
  test("login page has language selector", async ({ page }) => {
    await page.goto("/login");
    const langSelector = page.locator("button", { hasText: "English" }).first();
    await expect(langSelector).toBeVisible();
  });

  test("switching language on login page translates form labels", async ({ page }) => {
    await page.goto("/login");
    await page.locator("button", { hasText: "English" }).first().click();
    await page.waitForTimeout(300);
    await page.locator("button", { hasText: "Deutsch" }).click();
    await page.waitForTimeout(500);

    const loginHeading = page.locator("h2").first();
    await expect(loginHeading).toContainText("Anmelden");
  });
});

test.describe("i18n - all locales load", () => {
  for (const locale of LOCALES) {
    test(`${locale.code} (${locale.native}) loads and shows translated content`, async ({
      page,
    }) => {
      await page.goto("/");
      await page.evaluate((code) => localStorage.setItem("snapotter-locale", code), locale.code);
      // The translated dropzone text renders on a tool page, not the catalog home.
      await page.goto("/image/resize");
      await page.waitForTimeout(1000);

      const lang = await page.getAttribute("html", "lang");
      expect(lang).toBe(locale.code);

      const dir = await page.getAttribute("html", "dir");
      expect(dir).toBe(locale.dir);

      await expect(page.locator("body")).toContainText(locale.sample);
    });
  }
});

test.describe("i18n - tool names translate", () => {
  test("tool names and categories show in selected language", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("snapotter-locale", "de"));
    await page.reload();
    await page.waitForTimeout(1500);

    const body = await page.textContent("body");
    expect(body).toContain("Grundlagen");
    expect(body).toContain("Komprimieren");
  });

  test("tool names show in Japanese", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("snapotter-locale", "ja"));
    await page.reload();
    await page.waitForTimeout(1500);

    const body = await page.textContent("body");
    expect(body).toContain("リサイズ");
  });
});

test.describe("i18n - switching back to English", () => {
  test("can switch back to English after using another language", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("snapotter-locale", "de"));
    await page.reload();
    await page.waitForTimeout(1000);

    let lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("de");

    await page.evaluate(() => localStorage.setItem("snapotter-locale", "en"));
    // The dropzone "Upload from computer" text renders on a tool page, not the catalog home.
    await page.goto("/image/resize");
    await page.waitForTimeout(1000);

    lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("en");

    await expect(page.locator("body")).toContainText("Upload from computer");
  });
});
