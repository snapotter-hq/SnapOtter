import { resolveFontFile } from "@snapotter/media-engine";
import { describe, expect, it } from "vitest";

describe("resolveFontFile", () => {
  it("honors SNAPOTTER_FONT_FILE + SNAPOTTER_FONT_FAMILY", () => {
    process.env.SNAPOTTER_FONT_FILE = "/tmp/some.ttf";
    process.env.SNAPOTTER_FONT_FAMILY = "Some Family";
    try {
      const f = resolveFontFile();
      expect(f).toEqual({ file: "/tmp/some.ttf", family: "Some Family" });
    } finally {
      delete process.env.SNAPOTTER_FONT_FILE;
      delete process.env.SNAPOTTER_FONT_FAMILY;
    }
  });

  it("falls back to a real candidate on this machine", () => {
    const f = resolveFontFile();
    expect(f).not.toBeNull();
    expect(f?.file.length).toBeGreaterThan(0);
    expect(f?.family.length).toBeGreaterThan(0);
  });
});
