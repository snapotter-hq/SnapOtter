import { ar } from "@snapotter/shared/i18n/ar.js";
import { en } from "@snapotter/shared/i18n/en.js";
import { pl } from "@snapotter/shared/i18n/pl.js";
import { ru } from "@snapotter/shared/i18n/ru.js";
import { uk } from "@snapotter/shared/i18n/uk.js";
import { describe, expect, it } from "vitest";
import { formatTimeRemaining as formatFromPrompt } from "@/components/features/feature-install-prompt";
import { formatTimeRemaining as formatFromSection } from "@/components/settings/ai-features-section";

describe("formatTimeRemaining pluralization (#1255)", () => {
  it("handles the < 60000ms boundary correctly", () => {
    expect(formatFromPrompt(59999, en, "en")).toBe("Less than a minute left");
    expect(formatFromSection(59999, en, "en")).toBe("Less than a minute left");
  });

  it("handles English plural rules correctly", () => {
    // 1 minute -> "one"
    expect(formatFromPrompt(60000, en, "en")).toBe("~1 minute left");
    // 2 minutes -> "other" (aliased)
    expect(formatFromPrompt(2 * 60000, en, "en")).toBe("~2 minutes left");
    // 5 minutes -> "other" (aliased)
    expect(formatFromPrompt(5 * 60000, en, "en")).toBe("~5 minutes left");
  });

  it("handles Russian plural rules correctly", () => {
    // 1 minute (1 min * 60000 ms)
    expect(formatFromPrompt(60000, ru, "ru")).toBe("Осталось ~1 минута");
    // 2 minutes -> "few" in Russian
    expect(formatFromPrompt(2 * 60000, ru, "ru")).toBe("Осталось ~2 минуты");
    // 5 minutes -> "many" in Russian
    expect(formatFromPrompt(5 * 60000, ru, "ru")).toBe("Осталось ~5 минут");
    // 21 minutes -> "one" in Russian
    expect(formatFromPrompt(21 * 60000, ru, "ru")).toBe("Осталось ~21 минута");
  });

  it("handles Ukrainian plural rules correctly", () => {
    // 1 minute
    expect(formatFromPrompt(60000, uk, "uk")).toBe("Залишилась ~1 хвилина");
    // 2 minutes -> "few"
    expect(formatFromPrompt(2 * 60000, uk, "uk")).toBe("Залишилось ~2 хвилини");
    // 5 minutes -> "many"
    expect(formatFromPrompt(5 * 60000, uk, "uk")).toBe("Залишилось ~5 хвилин");
    // 21 minutes -> "one"
    expect(formatFromPrompt(21 * 60000, uk, "uk")).toBe("Залишилась ~21 хвилина");
  });

  it("handles Polish plural rules correctly", () => {
    // 1 minute -> "one"
    expect(formatFromPrompt(60000, pl, "pl")).toBe("Pozostała ~1 minuta");
    // 2 minutes -> "few"
    expect(formatFromPrompt(2 * 60000, pl, "pl")).toBe("Pozostały ~2 minuty");
    // 5 minutes -> "many"
    expect(formatFromPrompt(5 * 60000, pl, "pl")).toBe("Pozostało ~5 minut");
    // 21 minutes -> "many" in Polish
    expect(formatFromPrompt(21 * 60000, pl, "pl")).toBe("Pozostało ~21 minut");
    // 22 minutes -> "few" in Polish
    expect(formatFromPrompt(22 * 60000, pl, "pl")).toBe("Pozostały ~22 minuty");
  });

  it("handles Arabic plural rules correctly", () => {
    // 1 minute -> "one"
    expect(formatFromPrompt(60000, ar, "ar")).toBe("~دقيقة واحدة متبقية");
    // 2 minutes -> "two"
    expect(formatFromPrompt(2 * 60000, ar, "ar")).toBe("~دقيقتان متبقيتان");
    // 3 minutes -> "few"
    expect(formatFromPrompt(3 * 60000, ar, "ar")).toBe("~3 دقائق متبقية");
    // 11 minutes -> "many"
    expect(formatFromPrompt(11 * 60000, ar, "ar")).toBe("~11 دقيقة متبقية");
    // both implementations should work identically
    expect(formatFromSection(11 * 60000, ar, "ar")).toBe("~11 دقيقة متبقية");
  });
});
