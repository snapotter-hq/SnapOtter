import { SECTIONS, type Section, TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("toolSection", () => {
  it("maps non-document modalities directly", () => {
    expect(toolSection({ modality: "image", acceptedInputs: [".png"] })).toBe("image");
    expect(toolSection({ modality: "video", acceptedInputs: [".mp4"] })).toBe("video");
    expect(toolSection({ modality: "audio", acceptedInputs: [".mp3"] })).toBe("audio");
    expect(toolSection({ modality: "file", acceptedInputs: [".csv"] })).toBe("files");
  });

  it("splits document modality by .pdf input", () => {
    expect(toolSection({ modality: "document", acceptedInputs: [".pdf"] })).toBe("pdf");
    expect(toolSection({ modality: "document", acceptedInputs: [".docx", ".odt"] })).toBe("files");
  });

  it("partitions the catalog into exactly 29 PDF and 23 Files tools", () => {
    const bySection = (s: Section) =>
      TOOLS.filter((t) => toolSection(t) === s)
        .map((t) => t.id)
        .sort();
    expect(TOOLS.filter((t) => toolSection(t) === "image")).toHaveLength(106);
    expect(TOOLS.filter((t) => toolSection(t) === "video")).toHaveLength(57);
    expect(TOOLS.filter((t) => toolSection(t) === "audio")).toHaveLength(27);
    expect(bySection("pdf")).toHaveLength(29);
    expect(bySection("files")).toHaveLength(23);
    expect(bySection("pdf")).toContain("sign-pdf");
    expect(bySection("pdf")).toContain("merge-pdf");
    expect(bySection("pdf")).toContain("ocr-pdf");
    expect(bySection("files")).toContain("word-to-pdf");
    expect(bySection("files")).toContain("convert-spreadsheet");
    expect(bySection("files")).toContain("csv-json");
  });

  it("exposes 5 ordered sections", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["image", "video", "audio", "pdf", "files"]);
  });
});
