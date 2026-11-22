import {
  filterRelevantTools,
  type SearchableTool,
  TOOLS,
  unnamedFormatKeywords,
  withConverterFallback,
  withinOneEdit,
} from "@snapotter/shared";
import { describe, expect, it } from "vitest";

function tool(id: string, extra: Partial<SearchableTool> = {}): SearchableTool {
  return {
    id,
    name: id.replace(/-/g, " "),
    description: "",
    category: "misc",
    modality: "image",
    acceptedInputs: [],
    ...extra,
  };
}

describe("withinOneEdit", () => {
  it.each([
    ["crop", "crop"],
    ["crp", "crop"],
    ["cropp", "crop"],
    ["crap", "crop"],
    ["corp", "crop"],
  ])("%s is within one edit of %s", (a, b) => {
    expect(withinOneEdit(a, b)).toBe(true);
  });

  it.each([
    ["cr", "crop"],
    ["cpro", "crop"],
    ["font", "content"],
  ])("%s is not within one edit of %s", (a, b) => {
    expect(withinOneEdit(a, b)).toBe(false);
  });
});

describe("filterRelevantTools", () => {
  const watermark = tool("watermark-image", { description: "Overlay a logo as watermark" });
  const eraser = tool("erase-object", { keywords: ["remove watermark"] });
  const crop = tool("crop", { description: "Cut an image down" });

  it("drops a tool missing any query word", () => {
    expect(filterRelevantTools("remove watermark", [watermark, eraser])).toEqual([eraser]);
  });

  it("keeps result order", () => {
    const blurFaces = tool("blur-faces");
    const blurPad = tool("blur-pad");
    expect(filterRelevantTools("blur", [blurPad, blurFaces])).toEqual([blurPad, blurFaces]);
  });

  it("returns nothing when no tool has the words", () => {
    expect(filterRelevantTools("font", [watermark, eraser, crop])).toEqual([]);
  });

  it("falls back to typo matches only when nothing matches as typed", () => {
    expect(filterRelevantTools("crp", [crop])).toEqual([crop]);
    const png = tool("jpg-to-png");
    const raw = tool("convert", { keywords: ["dng"] });
    expect(filterRelevantTools("dng", [png, raw])).toEqual([raw]);
    expect(filterRelevantTools("dng", [png])).toEqual([]);
  });

  it("matches a word as a prefix and a plural as its singular", () => {
    expect(filterRelevantTools("compres", [tool("compress")])).toHaveLength(1);
    expect(filterRelevantTools("watermarks", [watermark])).toEqual([watermark]);
  });

  it("matches a plural of an aliased word in its canonical form", () => {
    const imageToPdf = tool("image-to-pdf");
    expect(filterRelevantTools("photos to pdf", [imageToPdf])).toEqual([imageToPdf]);
  });

  it("ignores connectives, stop words and one- or two-letter words", () => {
    const sign = tool("sign-pdf", { keywords: ["fill and sign"] });
    expect(filterRelevantTools("fill and sign", [sign])).toEqual([sign]);
    const bg = tool("remove-background");
    expect(filterRelevantTools("remove bg", [bg])).toEqual([bg]);
  });

  // #5190: no tool names "files", so "merge pdf files" dropped merge-pdf.
  it("does not require file or files", () => {
    const merge = tool("merge-pdf", { description: "Combine multiple PDFs into one" });
    expect(filterRelevantTools("merge pdf files", [merge])).toEqual([merge]);
    expect(filterRelevantTools("merge pdf file", [merge])).toEqual([merge]);
  });

  it("still requires the other words of a file query", () => {
    const zip = tool("zip-files", { modality: "file" });
    const crop = tool("crop");
    expect(filterRelevantTools("zip files", [zip, crop])).toEqual([zip]);
  });

  it("keeps everything for a query made only of filler", () => {
    expect(filterRelevantTools("the", [watermark, crop])).toEqual([watermark, crop]);
  });

  describe("with alias groups (#4899)", () => {
    const groups = [
      ["merge", "combine", "join"],
      ["remove background", "background remover", "cutout"],
    ];
    const merge = tool("merge-pdf", { description: "Merge PDF files into one" });
    const compressPdf = tool("compress-pdf");
    const bg = tool("remove-background");

    it("matches a query word through another phrase of its group", () => {
      expect(filterRelevantTools("combine pdf", [merge, compressPdf], groups)).toEqual([merge]);
      expect(filterRelevantTools("cutout", [bg, crop], groups)).toEqual([bg]);
    });

    it("needs every word of the alternative phrase", () => {
      const removePages = tool("remove-pages");
      expect(filterRelevantTools("cutout", [removePages], groups)).toEqual([]);
    });

    it("only expands words whose whole phrase is in the query", () => {
      // "remove" alone is not "remove background", so watermark-image can't
      // borrow the group's "cutout".
      const cutoutWatermark = tool("watermark-image", { keywords: ["cutout"] });
      expect(filterRelevantTools("remove watermark", [cutoutWatermark], groups)).toEqual([]);
    });

    it("leaves the default behaviour alone without groups", () => {
      expect(filterRelevantTools("combine pdf", [merge])).toEqual([]);
    });
  });
});

describe("withConverterFallback", () => {
  const convertAudio = tool("convert-audio", { acceptedInputs: [".mp3", ".ogg", ".opus"] });
  const mp4ToMp3 = tool("mp4-to-mp3", { acceptedInputs: [".mp4"] });
  const oggToMp3 = tool("ogg-to-mp3", { acceptedInputs: [".ogg"] });
  const all = [convertAudio, mp4ToMp3, oggToMp3];

  it("leads with the converter that takes both formats", () => {
    expect(withConverterFallback("mp3 to ogg", [oggToMp3], all)).toEqual([convertAudio, oggToMp3]);
  });

  it("moves a converter already in the results to the front", () => {
    expect(withConverterFallback("mp3 to ogg", [oggToMp3, convertAudio], all)).toEqual([
      convertAudio,
      oggToMp3,
    ]);
  });

  it("leaves a pair with a dedicated tool alone", () => {
    expect(withConverterFallback("mp4 to mp3", [mp4ToMp3], all)).toEqual([mp4ToMp3]);
    const withKeyword = [
      tool("convert", { acceptedInputs: [".jpg", ".ico"] }),
      tool("favicon", { keywords: ["jpg to ico"] }),
    ];
    expect(withConverterFallback("jpg to ico", [], withKeyword)).toEqual([]);
  });

  it("offers nothing when no converter takes both formats", () => {
    expect(withConverterFallback("png to opus", [], all)).toEqual([]);
  });

  it("ignores queries that aren't a pair", () => {
    expect(withConverterFallback("opus", [mp4ToMp3], all)).toEqual([mp4ToMp3]);
    expect(withConverterFallback("mp3 to mp3", [mp4ToMp3], all)).toEqual([mp4ToMp3]);
  });
});

describe("unnamedFormatKeywords", () => {
  it("gives a format nothing names to the converters that take it", () => {
    const tools = [
      tool("convert-audio", { acceptedInputs: [".mp3", ".opus"] }),
      tool("trim-audio", { acceptedInputs: [".mp3", ".opus"] }),
      tool("mp3-to-wav", { acceptedInputs: [".mp3"] }),
    ];
    expect(unnamedFormatKeywords(tools)).toEqual(new Map([["convert-audio", ["opus"]]]));
  });

  it("gives it to every tool that takes it when no converter does", () => {
    const tools = [
      tool("burn-subtitles", { acceptedInputs: [".mp4", ".vtt"] }),
      tool("embed-subtitles", { acceptedInputs: [".mp4", ".vtt"] }),
      tool("mp4-to-mp3", { acceptedInputs: [".mp4"] }),
    ];
    expect(unnamedFormatKeywords(tools)).toEqual(
      new Map([
        ["burn-subtitles", ["vtt"]],
        ["embed-subtitles", ["vtt"]],
      ]),
    );
  });

  it("skips a format a keyword already names", () => {
    const tools = [
      tool("convert", { acceptedInputs: [".ico"] }),
      tool("favicon", { acceptedInputs: [".png"], keywords: ["png to ico"] }),
    ];
    expect(unnamedFormatKeywords(tools).size).toBe(0);
  });

  it("is applied to the shipped catalog", () => {
    const keywordsOf = (id: string) => TOOLS.find((entry) => entry.id === id)?.keywords ?? [];
    expect(keywordsOf("convert-audio")).toEqual(expect.arrayContaining(["amr", "ac3"]));
    // The #1099 presets name opus and wma, so those rank the presets instead.
    expect(keywordsOf("convert-audio")).not.toContain("opus");
    expect(keywordsOf("convert")).toEqual(expect.arrayContaining(["nef", "arw", "cr2", "dng"]));
    expect(keywordsOf("convert")).not.toContain("png");
  });
});
