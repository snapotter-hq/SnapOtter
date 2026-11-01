// @vitest-environment node
import { isNewerVersion, parseLatestRelease } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const URL_OK = "https://github.com/snapotter-hq/SnapOtter/releases/tag/v2.4.0";

describe("isNewerVersion", () => {
  it("compares each part numerically, not as text", () => {
    expect(isNewerVersion("2.10.0", "2.9.9")).toBe(true);
    expect(isNewerVersion("3.0.0", "2.99.99")).toBe(true);
    expect(isNewerVersion("2.3.1", "2.3.0")).toBe(true);
  });

  it("is false for the same or an older version", () => {
    expect(isNewerVersion("2.3.0", "2.3.0")).toBe(false);
    expect(isNewerVersion("2.2.9", "2.3.0")).toBe(false);
    expect(isNewerVersion("1.99.0", "2.0.0")).toBe(false);
  });

  it("is false when either side is not a plain X.Y.Z", () => {
    expect(isNewerVersion("v2.4.0", "2.3.0")).toBe(false);
    expect(isNewerVersion("2.4.0-rc.1", "2.3.0")).toBe(false);
    expect(isNewerVersion("2.4", "2.3.0")).toBe(false);
    expect(isNewerVersion("2.4.0", "unknown")).toBe(false);
  });
});

describe("parseLatestRelease", () => {
  it("accepts an object or a JSON string payload", () => {
    const value = { version: "2.4.0", url: URL_OK };
    expect(parseLatestRelease(value)).toEqual(value);
    expect(parseLatestRelease(JSON.stringify(value))).toEqual(value);
  });

  it("accepts the snapotter.com and docs links", () => {
    for (const url of [
      "https://snapotter.com/blog/2-4",
      "https://docs.snapotter.com/changelog#v2-4-0",
    ]) {
      expect(parseLatestRelease({ version: "2.4.0", url })).toEqual({ version: "2.4.0", url });
    }
  });

  it("rejects links that point anywhere else", () => {
    for (const url of [
      "http://github.com/snapotter-hq/SnapOtter/releases/tag/v2.4.0",
      "https://github.com/someone-else/SnapOtter/releases/tag/v2.4.0",
      "https://snapotter.com.evil.example/",
      "javascript:alert(1)",
      `${URL_OK}${"x".repeat(400)}`,
    ]) {
      expect(parseLatestRelease({ version: "2.4.0", url })).toBeNull();
    }
  });

  it("rejects malformed payloads", () => {
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease(undefined)).toBeNull();
    expect(parseLatestRelease("not json")).toBeNull();
    expect(parseLatestRelease(42)).toBeNull();
    expect(parseLatestRelease({ version: "2.4.0" })).toBeNull();
    expect(parseLatestRelease({ version: "latest", url: URL_OK })).toBeNull();
    expect(parseLatestRelease({ version: 240, url: URL_OK })).toBeNull();
  });
});
