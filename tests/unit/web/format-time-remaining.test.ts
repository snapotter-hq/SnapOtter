import { ar } from "@snapotter/shared/i18n/ar.js";
import { ru } from "@snapotter/shared/i18n/ru.js";
import { describe, expect, it } from "vitest";
import { formatTimeRemaining } from "@/components/features/feature-install-prompt";

describe("formatTimeRemaining pluralization (#1255)", () => {
  it("handles Russian plural rules correctly", () => {
    // 1 minute (1 min * 60000 ms)
    expect(formatTimeRemaining(60000, ru, "ru")).toBe("Осталось ~1 минута");
    // 2 minutes -> "few" in Russian
    expect(formatTimeRemaining(2 * 60000, ru, "ru")).toBe("Осталось ~2 минуты");
    // 5 minutes -> "many" in Russian
    expect(formatTimeRemaining(5 * 60000, ru, "ru")).toBe("Осталось ~5 минут");
    // 21 minutes -> "one" in Russian
    expect(formatTimeRemaining(21 * 60000, ru, "ru")).toBe("Осталось ~21 минута");
  });

  it("handles Arabic plural rules correctly", () => {
    // 1 minute -> "one" in Arabic
    expect(formatTimeRemaining(60000, ar, "ar")).toBe("~دقيقة واحدة متبقية");
    // 2 minutes -> "two" in Arabic
    expect(formatTimeRemaining(2 * 60000, ar, "ar")).toBe("~دقيقتان متبقيتان");
    // 3 minutes -> "few" in Arabic
    expect(formatTimeRemaining(3 * 60000, ar, "ar")).toBe("~3 دقائق متبقية");
    // 11 minutes -> "many" in Arabic
    expect(formatTimeRemaining(11 * 60000, ar, "ar")).toBe("~11 دقيقة متبقية");
  });
});
