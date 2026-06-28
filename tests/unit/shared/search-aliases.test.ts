import { describe, expect, it } from "vitest";
import {
  generateConversionKeywords,
  normalizeSearchQuery,
} from "../../../packages/shared/src/search/format-aliases.js";

describe("normalizeSearchQuery", () => {
  it("lowercases and trims", () => {
    expect(normalizeSearchQuery("  JPG To PNG ")).toBe("jpg to png");
  });
  it("maps the standalone digit 2 to 'to'", () => {
    expect(normalizeSearchQuery("jpg 2 png")).toBe("jpg to png");
  });
  it("splits joined compact forms jpg2png", () => {
    expect(normalizeSearchQuery("jpg2png")).toBe("jpg to png");
  });
  it("splits jpgtopng", () => {
    expect(normalizeSearchQuery("jpgtopng")).toBe("jpg to png");
  });
  it("collapses separators - _ .", () => {
    expect(normalizeSearchQuery("jpg-to_png.")).toBe("jpg to png");
  });
  it("expands synonyms jpeg -> jpg", () => {
    expect(normalizeSearchQuery("jpeg to png")).toBe("jpg to png");
  });
  it("drops filler words convert/file/online but keeps formats", () => {
    expect(normalizeSearchQuery("convert mp4 to mp3 file online")).toBe("mp4 to mp3");
  });
});

describe("generateConversionKeywords", () => {
  it("emits formats, aliases, phrasings and compact forms", () => {
    const kw = generateConversionKeywords({ from: "JPG", to: "PNG" });
    expect(kw).toEqual(
      expect.arrayContaining([
        "jpg",
        "jpeg",
        "png",
        "jpg to png",
        "jpeg to png",
        "jpg2png",
        "jpgtopng",
        "png from jpg",
        "jpg converter",
        "png converter",
      ]),
    );
  });
  it("dedupes", () => {
    const kw = generateConversionKeywords({ from: "PNG", to: "PNG" });
    expect(new Set(kw).size).toBe(kw.length);
  });
});
