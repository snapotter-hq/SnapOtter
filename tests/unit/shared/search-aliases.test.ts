import { describe, expect, it } from "vitest";
import { TOOLS } from "../../../packages/shared/src/constants.js";
import { CONVERSION_PRESETS } from "../../../packages/shared/src/conversion-presets.js";
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

  // #1327: the joined-form split fired on any word with "to" inside it.
  it.each(["vectorize", "customize", "histogram", "photograph"])("leaves %j whole", (word) => {
    expect(normalizeSearchQuery(word)).toBe(word);
  });

  it("only splits a joined form between whole format tokens", () => {
    expect(normalizeSearchQuery("xjpgtopng")).toBe("xjpgtopng");
    expect(normalizeSearchQuery("jpgtopngs")).toBe("jpgtopngs");
    expect(normalizeSearchQuery("jpgtopng-online")).toBe("jpg to png");
    expect(normalizeSearchQuery("JPGtoPNG pngtowebp")).toBe("jpg to png png to webp");
  });

  it("doesn't read inherited object keys as aliases", () => {
    expect(normalizeSearchQuery("constructor")).toBe("constructor");
    expect(normalizeSearchQuery("toString")).toBe("tostring");
  });

  it("still splits every joined form a conversion preset advertises", () => {
    let checked = 0;
    for (const preset of CONVERSION_PRESETS) {
      for (const kw of generateConversionKeywords({ from: preset.from, to: preset.to })) {
        const joined = /^([a-z0-9]+)to([a-z0-9]+)$/.exec(kw);
        if (!joined) continue;
        checked++;
        expect(normalizeSearchQuery(kw), `${preset.id}: ${kw}`).toBe(
          normalizeSearchQuery(`${joined[1]} to ${joined[2]}`),
        );
      }
    }
    expect(checked).toBeGreaterThan(CONVERSION_PRESETS.length);
  });

  it("splits the joined form of every x-to-y tool id", () => {
    const ids = TOOLS.map((t) => /^([a-z0-9]+)-to-([a-z0-9]+)$/.exec(t.id)).filter(
      (m): m is RegExpExecArray => m !== null,
    );
    expect(ids.length).toBeGreaterThan(20);
    for (const [id, from, to] of ids) {
      expect(normalizeSearchQuery(`${from}to${to}`), id).toBe(
        normalizeSearchQuery(`${from} to ${to}`),
      );
    }
  });

  // #1327: "convert" is filler in "convert jpg to png", but in "convert image"
  // it's half of the Convert Image tool's name.
  it("keeps convert when only a bare modality word would be left", () => {
    expect(normalizeSearchQuery("convert image")).toBe("convert image");
    expect(normalizeSearchQuery("Convert Image")).toBe("convert image");
    expect(normalizeSearchQuery("convert photo")).toBe("convert image");
    expect(normalizeSearchQuery("convert video")).toBe("convert video");
    expect(normalizeSearchQuery("convert audio")).toBe("convert audio");
    expect(normalizeSearchQuery("convert images")).toBe("convert images");
    expect(normalizeSearchQuery("covert the image file")).toBe("convert image");
  });

  it("still drops convert before a format or a direction", () => {
    expect(normalizeSearchQuery("convert jpg")).toBe("jpg");
    expect(normalizeSearchQuery("convert image to pdf")).toBe("image to pdf");
    expect(normalizeSearchQuery("convert")).toBe("");
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
