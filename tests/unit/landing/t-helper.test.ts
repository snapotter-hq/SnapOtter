// tests/unit/landing/t-helper.test.ts
import { describe, expect, it } from "vitest";
import { isRtl, LANDING_LOCALES, t } from "../../../apps/landing/src/i18n/index.ts";

describe("landing t() helper", () => {
  it("returns the English string for a known key", () => {
    expect(t("en", "nav.pricing")).toBe("Pricing");
  });

  it("falls back to English when the locale is missing the key", () => {
    // "de" catalog is generated later; before that, unknown locale still falls back.
    expect(t("xx", "nav.pricing")).toBe("Pricing");
  });

  it("returns the key itself when the key does not exist anywhere", () => {
    expect(t("en", "does.not.exist")).toBe("does.not.exist");
  });

  it("exposes the 21 landing locales including en and ar", () => {
    expect(LANDING_LOCALES).toContain("en");
    expect(LANDING_LOCALES).toContain("ar");
    expect(LANDING_LOCALES).toContain("pt-BR");
    expect(LANDING_LOCALES.length).toBe(21);
  });

  it("marks ar as RTL and de as LTR", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("de")).toBe(false);
    expect(isRtl("en")).toBe(false);
  });
});
