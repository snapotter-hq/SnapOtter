import { describe, expect, it, vi } from "vitest";
import { isApplePlatform } from "@/lib/platform";

describe("isApplePlatform", () => {
  it.each([
    ["MacIntel", true],
    ["iPhone", true],
    ["iPad", true],
    ["iPod touch", true],
    ["Win32", false],
    ["Linux x86_64", false],
    ["Linux armv8l", false],
  ])("reads navigator.platform %s as apple=%s", (platform, expected) => {
    expect(isApplePlatform({ platform })).toBe(expected);
  });

  it("trusts navigator.platform over a client-hint platform that follows an emulated user agent", () => {
    // Playwright's "Desktop Chrome" descriptor reports Windows client hints on a
    // Mac host while navigator.platform stays MacIntel; the real OS decides.
    expect(isApplePlatform({ platform: "MacIntel", userAgentData: { platform: "Windows" } })).toBe(
      true,
    );
    expect(
      isApplePlatform({ platform: "Linux x86_64", userAgentData: { platform: "macOS" } }),
    ).toBe(false);
  });

  it("falls back to the client-hint platform when navigator.platform is blank", () => {
    expect(isApplePlatform({ platform: "", userAgentData: { platform: "macOS" } })).toBe(true);
    expect(isApplePlatform({ platform: "", userAgentData: { platform: "Windows" } })).toBe(false);
    expect(isApplePlatform({ platform: "", userAgentData: { platform: "Chrome OS" } })).toBe(false);
  });

  it("falls back to the user-agent string when both platform sources are blank", () => {
    const safariMac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    const chromeWindows =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
    const chromeAndroid =
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
    const chromeIphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1";
    expect(isApplePlatform({ platform: "", userAgent: safariMac })).toBe(true);
    expect(isApplePlatform({ platform: "", userAgent: chromeIphone })).toBe(true);
    expect(isApplePlatform({ platform: "", userAgent: chromeWindows })).toBe(false);
    expect(isApplePlatform({ platform: "", userAgent: chromeAndroid })).toBe(false);
  });

  it("answers false when the navigator reports nothing", () => {
    expect(isApplePlatform({})).toBe(false);
  });

  it("answers false without throwing when there is no global navigator (SSR)", () => {
    vi.stubGlobal("navigator", undefined);
    try {
      expect(isApplePlatform()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads the global navigator by default", () => {
    vi.stubGlobal("navigator", { platform: "MacIntel" });
    try {
      expect(isApplePlatform()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
