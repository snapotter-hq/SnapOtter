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
  it("splits joined compact forms jpg2png and mp42mp3", () => {
    expect(normalizeSearchQuery("jpg2png")).toBe("jpg to png");
    expect(normalizeSearchQuery("mp42mp3")).toBe("mp4 to mp3");
    expect(normalizeSearchQuery("mp32wav")).toBe("mp3 to wav");
    expect(normalizeSearchQuery("m4a2mp3")).toBe("m4a to mp3");
  });
  // #1388 review: these split under the old letter-2-letter regex, so the
  // known-format list has to cover them too.
  it.each([
    ["yaml2json", "yaml to json"],
    ["htm2pdf", "htm to pdf"],
    ["odp2pdf", "odp to pdf"],
    ["tsv2csv", "tsv to csv"],
    ["apng2gif", "apng to gif"],
    ["srt2vtt", "srt to vtt"],
    ["speech2text", "speech to text"],
    ["voice2text", "voice to text"],
  ])("splits %j", (query, expected) => {
    expect(normalizeSearchQuery(query)).toBe(expected);
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

  // #1327, #1366: the joined-form split fired on any word with "to" or "2" inside it.
  it.each(["vectorize", "customize", "histogram", "photograph", "h2o", "a2b"])(
    "leaves %j whole",
    (word) => {
      expect(normalizeSearchQuery(word)).toBe(word);
    },
  );

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
        const joined = /^([a-z0-9]+)(?:to|2)([a-z0-9]+)$/.exec(kw);
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
      expect(normalizeSearchQuery(`${from}2${to}`), id).toBe(
        normalizeSearchQuery(`${from} to ${to}`),
      );
    }
  });

  // #1408: a joined form only splits between known formats, so every extension
  // a tool accepts has to be one of them.
  it("splits joined forms for every extension a tool accepts", () => {
    const exts = new Set(TOOLS.flatMap((t) => t.acceptedInputs).map((ext) => ext.slice(1)));
    expect(exts.size).toBeGreaterThan(50);
    for (const ext of exts) {
      expect(normalizeSearchQuery(`${ext}topdf`), ext).toBe(normalizeSearchQuery(`${ext} to pdf`));
      expect(normalizeSearchQuery(`pdf2${ext}`), ext).toBe(normalizeSearchQuery(`pdf to ${ext}`));
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
