import { en, loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

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
    const t = await loadTranslations("en");
    expect(t.common.upload).toBe("Upload from computer");
  });

  it("returns English fallback for unsupported locale", async () => {
    const t = await loadTranslations("xx-XX");
    expect(t.common.upload).toBe("Upload from computer");
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
      "analytics",
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

  it("has 12 categories", () => {
    expect(Object.keys(en.categories)).toHaveLength(12);
  });
});
