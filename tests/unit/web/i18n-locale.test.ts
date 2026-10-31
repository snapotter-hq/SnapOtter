import { en, loadTranslations, SUPPORTED_LOCALES, TRANSLATION_LOADERS } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

describe("SUPPORTED_LOCALES", () => {
  it("has 21 locales including English", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(21);
  });

  it("includes English as first entry", () => {
    expect(SUPPORTED_LOCALES[0].code).toBe("en");
    expect(SUPPORTED_LOCALES[0].dir).toBe("ltr");
  });

  it("has Arabic as RTL", () => {
    const ar = SUPPORTED_LOCALES.find((l) => l.code === "ar");
    expect(ar).toBeDefined();
    expect(ar?.dir).toBe("rtl");
  });

  it("all locales have required fields", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(locale.code).toBeTruthy();
      expect(locale.name).toBeTruthy();
      expect(locale.nativeName).toBeTruthy();
      expect(["ltr", "rtl"]).toContain(locale.dir);
    }
  });
});

describe("loadTranslations", () => {
  it("returns English translations for 'en'", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = await loadTranslations("en");
    expect(t.common.upload).toBe("Upload from computer");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns English fallback for unsupported locale without logging error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = await loadTranslations("xx-XX");
    expect(t.common.upload).toBe("Upload from computer");
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs error and falls back to en when a translation loader rejects", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalLoader = TRANSLATION_LOADERS.de;
    const testError = new Error("Chunk failed to load");
    try {
      TRANSLATION_LOADERS.de = () => Promise.reject(testError);
      const t = await loadTranslations("de");
      expect(t).toBe(en);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith("Failed to load translations", {
        locale: "de",
        error: testError,
      });
    } finally {
      TRANSLATION_LOADERS.de = originalLoader;
      errorSpy.mockRestore();
    }
  });
});

describe("en translation completeness", () => {
  it("has all required top-level sections", () => {
    const sections = Object.keys(en);
    const required = [
      "common",
      "categories",
      "tools",
      "toolSettings",
      "toolPage",
      "homePage",
      "fullscreenGrid",
      "editor",
      "settings",
      "auth",
      "changePassword",
      "automate",
      "nav",
      "files",
      "dropzone",
      "reviewPanel",
      "features",
      "help",
      "errors",
      "sidebar",
      "toolCard",
      "appLayout",
    ];
    for (const key of required) {
      expect(sections, `missing section: ${key}`).toContain(key);
    }
  });

  it("has 25 rotating phrases", () => {
    expect(en.auth.rotatingPhrases).toHaveLength(25);
  });

  it("has 30 progress messages", () => {
    expect(en.features.progressMessages).toHaveLength(30);
  });

  it("has 24 categories", () => {
    expect(Object.keys(en.categories)).toHaveLength(24);
  });
});
