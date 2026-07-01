import { CATEGORIES, TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import {
  buildToolRequestDiscussionUrl,
  matchTool,
  scoreTool,
  searchTools,
  type ToolSearchItem,
} from "../../../apps/landing/src/lib/tool-search.js";

const jpgPng = {
  id: "jpg-to-png",
  haystack: "jpg to png convert jpg to png jpg jpeg png",
};

const tools: ToolSearchItem[] = [
  {
    id: "compress",
    name: "Compress",
    description: "Reduce image file size by quality or target size",
    modality: "image",
    category: "optimization",
    url: "/tools/image/compress/",
    icon: "Minimize2",
    iconSvg: "",
    color: "#10B981",
    acceptedInputs: ["image/jpeg", "image/png"],
    outputModality: "image",
    keywords: ["image compression", "jpg size reducer", "optimize image"],
    workflowAliases: ["optimize web", "reduce image size"],
  },
  {
    id: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce PDF file size while preserving readability",
    modality: "document",
    category: "pdf-optimize",
    url: "/tools/pdf/compress-pdf/",
    icon: "Minimize2",
    iconSvg: "",
    color: "#10B981",
    acceptedInputs: ["application/pdf", "pdf"],
    outputModality: "document",
    keywords: ["pdf compression", "reduce pdf size", "compress document"],
    workflowAliases: ["optimize pdf", "reduce pdf size"],
  },
  {
    id: "convert-document",
    name: "Convert Document",
    description: "Convert PDF and document files between formats",
    modality: "document",
    category: "document-conversion",
    url: "/tools/pdf/convert-document/",
    icon: "FileOutput",
    iconSvg: "",
    color: "#3B82F6",
    acceptedInputs: ["application/pdf", "pdf", "docx"],
    outputModality: "document",
    keywords: ["pdf converter", "document converter", "change document format"],
    workflowAliases: [],
  },
  {
    id: "inspect-pdf",
    name: "Inspect PDF",
    description: "Inspect PDF metadata and page information",
    modality: "document",
    category: "pdf-inspect",
    url: "/tools/pdf/inspect-pdf/",
    icon: "Info",
    iconSvg: "",
    color: "#6366F1",
    acceptedInputs: ["application/pdf", "pdf"],
    outputModality: "document",
    keywords: ["pdf metadata", "document properties"],
    workflowAliases: ["inspect document"],
  },
  {
    id: "convert",
    name: "Convert",
    description: "Convert between image formats",
    modality: "image",
    category: "essentials",
    url: "/tools/image/convert/",
    icon: "FileOutput",
    iconSvg: "",
    color: "#3B82F6",
    acceptedInputs: ["image/jpeg", "image/png", "jpg", "png", "webp"],
    outputModality: "image",
    keywords: ["jpg to png", "image converter"],
    workflowAliases: [],
  },
  {
    id: "remove-background",
    name: "Remove Background",
    description: "Remove image backgrounds and export transparent PNG files",
    modality: "image",
    category: "enhance",
    url: "/tools/image/remove-background/",
    icon: "Sparkles",
    iconSvg: "",
    color: "#F59E0B",
    acceptedInputs: ["image/jpeg", "image/png"],
    outputModality: "image",
    keywords: ["remove bg", "cutout", "transparent background", "transparent png"],
    workflowAliases: ["enhance ai"],
  },
  {
    id: "trim-video",
    name: "Trim Video",
    description: "Cut video clips by start and end time",
    modality: "video",
    category: "video-edit",
    url: "/tools/video/trim-video/",
    icon: "Scissors",
    iconSvg: "",
    color: "#EF4444",
    acceptedInputs: ["video/mp4", "mp4"],
    outputModality: "video",
    keywords: ["cut video", "shorten mp4"],
    workflowAliases: [],
  },
  {
    id: "inspect-psd",
    name: "Inspect PSD",
    description: "Inspect Photoshop document metadata and layers",
    modality: "image",
    category: "image-inspect",
    url: "/tools/image/inspect-psd/",
    icon: "Info",
    iconSvg: "",
    color: "#6366F1",
    acceptedInputs: ["image/vnd.adobe.photoshop", "psd"],
    outputModality: "image",
    keywords: ["psd metadata", "photoshop layers"],
    workflowAliases: ["inspect psd"],
  },
];

function getToolFixture(id: string): ToolSearchItem {
  const tool = tools.find((entry) => entry.id === id);
  if (!tool) {
    throw new Error(`Missing tool fixture: ${id}`);
  }
  return tool;
}

const realTools: ToolSearchItem[] = TOOLS.map((tool) => {
  const category = CATEGORIES.find((entry) => entry.id === tool.category);
  return {
    id: tool.id,
    name: tool.name,
    description: tool.description,
    modality: tool.modality,
    category: tool.category,
    url: `/tools/${toolSection(tool)}/${tool.id}/`,
    icon: tool.icon,
    iconSvg: "",
    color: category?.color ?? "#6B7280",
    acceptedInputs: tool.acceptedInputs,
    outputModality: tool.outputModality,
    keywords: tool.keywords,
    workflowAliases: [],
  };
});

const genericConverterIds = ["convert", "convert-audio", "convert-video", "convert-spreadsheet"];
const pdfConversionIds = new Set([
  "pdf-to-word",
  "pdf-to-jpg",
  "pdf-to-png",
  "pdf-to-tiff",
  "pdf-to-image",
]);
const psdConversionIds = new Set(["psd-to-jpg", "psd-to-png", "psd-to-svg"]);
const toPdfConversionIds = new Set([
  "jpg-to-pdf",
  "png-to-pdf",
  "heic-to-pdf",
  "tiff-to-pdf",
  "webp-to-pdf",
  "gif-to-pdf",
  "eps-to-pdf",
  "word-to-pdf",
  "excel-to-pdf",
  "powerpoint-to-pdf",
  "html-to-pdf",
  "markdown-to-pdf",
  "image-to-pdf",
]);
const fromPdfConversionIds = new Set(["pdf-to-word", "pdf-to-jpg", "pdf-to-png", "pdf-to-tiff"]);
const videoToAudioIds = new Set([
  "extract-audio",
  "mp4-to-mp3",
  "mov-to-mp3",
  "mkv-to-mp3",
  "webm-to-mp3",
  "avi-to-mp3",
  "mp4-to-wav",
  "mov-to-wav",
  "mp4-to-ogg",
  "convert-audio",
]);

describe("landing matchTool", () => {
  it.each(["jpeg to png", "jpg2png", "jpg to png", "covert jpg to png"])("matches %s", (q) => {
    expect(matchTool(q, jpgPng.haystack)).toBe(true);
  });

  it("typo within one edit still matches via fallback", () => {
    expect(matchTool("jpge to png", jpgPng.haystack)).toBe(true);
  });

  it("rejects unrelated query", () => {
    expect(matchTool("trim video", jpgPng.haystack)).toBe(false);
  });

  it("requires exact matches for known short file formats", () => {
    expect(matchTool("jpg2png", "jpg2png")).toBe(true);
    expect(matchTool("mp4 to mp3", "convert video mp4 mov mkv avi webm")).toBe(false);
    expect(
      matchTool("mp4 to mp3", "m4a to mp3 aac to mp3 wav to mp3 ogg to mp3 audio converter"),
    ).toBe(false);
    expect(matchTool("mp4 to mp3", "mp4 to mp3 extract audio from mp4 as mp3")).toBe(true);
    expect(matchTool("add text to image", "add text captions and labels to images")).toBe(true);
    expect(matchTool("pdf to jpg", "convert image jpg png webp")).toBe(false);
    expect(matchTool("pdf to jpg", "jpg to pdf convert jpg images to pdf")).toBe(false);
    expect(matchTool("pdf to jpg", "pdf to jpg convert pdf pages to images")).toBe(true);
    expect(matchTool("aviftopng", "png to avif convert png images to avif")).toBe(false);
    expect(matchTool("aviftopng", "avif to png convert avif images to png")).toBe(true);
  });
});

describe("landing scoreTool", () => {
  it("scores exact or near-exact tool name matches with a reason", () => {
    const result = scoreTool("remove background", getToolFixture("remove-background"));
    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toMatch(/name|keyword/i);
  });

  it("ranks conversion shorthand through normalized keywords", () => {
    const result = searchTools(tools, { query: "jpg2png", modality: "all", limit: 5 });
    expect(result.results[0]?.item.id).toBe("convert");
    expect(result.results[0]?.score).toBeGreaterThan(0);
    expect(result.hasConfidentMatch).toBe(true);
  });

  it("ranks PDF compression above generic image compression", () => {
    const result = searchTools(tools, { query: "compress pdf", modality: "all", limit: 5 });
    expect(result.results[0]?.item.id).toBe("compress-pdf");
  });

  it("preserves conversion intent when ranking PDF tools", () => {
    const result = searchTools(tools, { query: "convert pdf", modality: "all", limit: 5 });
    expect(result.results[0]?.item.id).toBe("convert-document");
  });

  it("preserves conversion intent when ranking document tools", () => {
    const result = searchTools(tools, { query: "convert document", modality: "all", limit: 5 });
    expect(result.results[0]?.item.id).toBe("convert-document");
  });

  it("keeps unsupported conversion searches away from unrelated confident first results", () => {
    const result = searchTools(tools, { query: "convert psd", modality: "all", limit: 5 });
    expect(result.results.map((entry) => entry.item.id)).not.toContain("inspect-psd");
    expect(result.hasConfidentMatch).toBe(false);
  });

  it("understands common task aliases", () => {
    const result = searchTools(tools, {
      query: "remove bg transparent",
      modality: "all",
      limit: 5,
    });
    expect(result.results[0]?.item.id).toBe("remove-background");
  });

  it("hard-filters by modality after scoring", () => {
    const result = searchTools(tools, { query: "compress", modality: "document", limit: 5 });
    expect(result.results.map((entry) => entry.item.id)).toEqual(["compress-pdf"]);
  });

  it("reports no confident match for unrelated searches", () => {
    const result = searchTools(tools, {
      query: "convert figma file to layered psd",
      modality: "all",
      limit: 5,
    });
    expect(result.results).toHaveLength(0);
    expect(result.hasConfidentMatch).toBe(false);
  });
});

describe("landing searchTools with real catalog metadata", () => {
  it("ranks PDF-specific conversion before generic converters for convert pdf", () => {
    const result = searchTools(realTools, { query: "convert pdf", modality: "all", limit: 8 });
    const firstId = result.results[0]?.item.id;

    expect(firstId).toBeDefined();
    expect(firstId?.startsWith("pdf-to-") || pdfConversionIds.has(firstId ?? "")).toBe(true);
    expect(genericConverterIds).not.toContain(firstId);
  });

  it("ranks document conversion before generic converters for convert document", () => {
    const result = searchTools(realTools, { query: "convert document", modality: "all", limit: 8 });
    const rankedIds = result.results.map((entry) => entry.item.id);

    expect(rankedIds[0]).toBe("convert-document");
    for (const genericId of genericConverterIds) {
      const genericIndex = rankedIds.indexOf(genericId);
      if (genericIndex !== -1) {
        expect(genericIndex).toBeGreaterThan(rankedIds.indexOf("convert-document"));
      }
    }
  });

  it("ranks PSD-specific conversion before generic converters for convert psd", () => {
    const result = searchTools(realTools, { query: "convert psd", modality: "all", limit: 8 });
    const firstId = result.results[0]?.item.id;

    expect(firstId).toBeDefined();
    expect(psdConversionIds.has(firstId ?? "")).toBe(true);
    expect(genericConverterIds).not.toContain(firstId);
  });

  it("ranks destination-to-PDF tools before PDF source converters for convert to pdf", () => {
    const result = searchTools(realTools, { query: "convert to pdf", modality: "all", limit: 8 });
    const firstId = result.results[0]?.item.id;

    expect(firstId).toBeDefined();
    expect(firstId?.endsWith("-to-pdf") || toPdfConversionIds.has(firstId ?? "")).toBe(true);
    expect(fromPdfConversionIds.has(firstId ?? "")).toBe(false);
    expect(genericConverterIds).not.toContain(firstId);
  });

  it("keeps explicit PDF source direction for pdf to jpg", () => {
    const result = searchTools(realTools, { query: "pdf to jpg", modality: "all", limit: 8 });

    expect(result.results[0]?.item.id).toBe("pdf-to-jpg");
  });

  it("does not create confident results for same-format alias conversions", () => {
    const result = searchTools(realTools, { query: "jpg to jpeg", modality: "all", limit: 8 });

    expect(result.results).toHaveLength(0);
    expect(result.hasConfidentMatch).toBe(false);
  });

  it("returns confident results for document extension conversions", () => {
    const result = searchTools(realTools, { query: "doc to docx", modality: "all", limit: 8 });

    expect(result.hasConfidentMatch).toBe(true);
    expect(result.results[0]?.item.id).toBe("convert-document");
  });

  it("returns confident results for presentation extension conversions", () => {
    const result = searchTools(realTools, { query: "ppt to pptx", modality: "all", limit: 8 });

    expect(result.hasConfidentMatch).toBe(true);
    expect(result.results[0]?.item.id).toBe("convert-presentation");
  });

  it("returns confident results for spreadsheet extension conversions", () => {
    const result = searchTools(realTools, { query: "xls to xlsx", modality: "all", limit: 8 });

    expect(result.hasConfidentMatch).toBe(true);
    expect(result.results[0]?.item.id).toBe("convert-spreadsheet");
  });

  it("returns confident results for broad video to audio conversion", () => {
    const result = searchTools(realTools, {
      query: "convert video to audio",
      modality: "all",
      limit: 5,
    });

    expect(result.hasConfidentMatch).toBe(true);
    expect(videoToAudioIds.has(result.results[0]?.item.id ?? "")).toBe(true);
  });

  it("returns confident results for MP4 to audio conversion", () => {
    const result = searchTools(realTools, {
      query: "mp4 to audio",
      modality: "all",
      limit: 5,
    });

    expect(result.hasConfidentMatch).toBe(true);
    expect(videoToAudioIds.has(result.results[0]?.item.id ?? "")).toBe(true);
  });

  it("treats audio from video as video to audio conversion", () => {
    const result = searchTools(realTools, {
      query: "convert audio from video",
      modality: "all",
      limit: 5,
    });
    const firstId = result.results[0]?.item.id;

    expect(result.hasConfidentMatch).toBe(true);
    expect(videoToAudioIds.has(firstId ?? "")).toBe(true);
    expect(firstId).not.toBe("video-to-webp");
    expect(firstId).not.toBe("video-to-gif");
  });

  it("treats mp3 from mp4 as mp4 to mp3 conversion", () => {
    const result = searchTools(realTools, {
      query: "convert mp3 from mp4",
      modality: "all",
      limit: 5,
    });
    const rankedIds = result.results.map((entry) => entry.item.id);
    const mp4ToMp3Index = rankedIds.indexOf("mp4-to-mp3");

    expect(result.hasConfidentMatch).toBe(true);
    expect(["mp4-to-mp3", "extract-audio", "convert-audio"]).toContain(result.results[0]?.item.id);
    expect(mp4ToMp3Index).not.toBe(-1);
    for (const unrelatedId of ["mp4-to-wav", "mp4-to-ogg", "mp4-to-aac", "mp4-to-flac"]) {
      const unrelatedIndex = rankedIds.indexOf(unrelatedId);
      if (unrelatedIndex !== -1) {
        expect(unrelatedIndex).toBeGreaterThan(mp4ToMp3Index);
      }
    }
  });

  it("returns confident results for broad video to MP4 conversion", () => {
    const result = searchTools(realTools, {
      query: "convert video to mp4",
      modality: "all",
      limit: 5,
    });
    const firstId = result.results[0]?.item.id;
    const rankedIds = result.results.map((entry) => entry.item.id);

    expect(result.hasConfidentMatch).toBe(true);
    expect(firstId === "convert-video" || firstId?.endsWith("-to-mp4")).toBe(true);
    expect(rankedIds).not.toContain("compress-video");
  });

  it("returns confident results for broad audio to MP3 conversion", () => {
    const result = searchTools(realTools, {
      query: "convert audio to mp3",
      modality: "all",
      limit: 5,
    });
    const firstId = result.results[0]?.item.id;
    const rankedIds = result.results.map((entry) => entry.item.id);

    expect(result.hasConfidentMatch).toBe(true);
    expect(firstId === "convert-audio" || firstId?.endsWith("-to-mp3")).toBe(true);
    expect(rankedIds).not.toContain("transcribe-audio");
  });

  it("returns confident results for broad image to PDF conversion", () => {
    const result = searchTools(realTools, {
      query: "convert images to pdf",
      modality: "all",
      limit: 5,
    });
    const firstId = result.results[0]?.item.id;

    expect(result.hasConfidentMatch).toBe(true);
    expect(firstId === "image-to-pdf" || firstId?.endsWith("-to-pdf")).toBe(true);
  });

  it("returns confident results for broad document to PDF conversion", () => {
    const result = searchTools(realTools, {
      query: "convert documents to pdf",
      modality: "all",
      limit: 5,
    });
    const firstId = result.results[0]?.item.id;

    expect(result.hasConfidentMatch).toBe(true);
    expect(
      firstId === "convert-document" ||
        [
          "word-to-pdf",
          "excel-to-pdf",
          "powerpoint-to-pdf",
          "html-to-pdf",
          "markdown-to-pdf",
        ].includes(firstId ?? ""),
    ).toBe(true);
  });

  it("keeps broad image convert available for bmp to png", () => {
    const result = searchTools(realTools, { query: "bmp to png", modality: "all", limit: 5 });
    const rankedIds = result.results.map((entry) => entry.item.id);

    expect(result.results[0]?.item.id).toBe("convert");
    expect(result.hasConfidentMatch).toBe(true);
    expect(rankedIds).not.toContain("ocr");
    expect(rankedIds).not.toContain("colorize");
    expect(rankedIds).not.toContain("optimize-for-web");
  });

  it("does not rank reversed AVIF conversion first for avif to png", () => {
    const result = searchTools(realTools, { query: "avif to png", modality: "all", limit: 5 });

    expect(result.results[0]?.item.id).toBe("convert");
    expect(result.results[0]?.item.id).not.toBe("png-to-avif");
  });

  it("normalizes compact AVIF conversion aliases before direction ranking", () => {
    const result = searchTools(realTools, { query: "avif2png", modality: "all", limit: 5 });
    const rankedIds = result.results.map((entry) => entry.item.id);

    expect(result.results[0]?.item.id).toBe("convert");
    expect(result.results[0]?.item.id).not.toBe("png-to-avif");
    expect(rankedIds).not.toContain("ocr");
    expect(rankedIds).not.toContain("colorize");
    expect(rankedIds).not.toContain("optimize-for-web");
  });

  it("does not treat remove background from image as conversion intent", () => {
    const result = searchTools(realTools, {
      query: "remove background from image",
      modality: "all",
      limit: 5,
    });

    expect(result.results[0]?.item.id).toBe("remove-background");
    expect(result.hasConfidentMatch).toBe(true);
  });

  it("does not treat add text to image as conversion intent", () => {
    const result = searchTools(realTools, {
      query: "add text to image",
      modality: "all",
      limit: 8,
    });

    expect(result.results[0]?.item.id).toBe("text-overlay");
  });

  it("does not treat add watermark to pdf as conversion intent", () => {
    const result = searchTools(realTools, {
      query: "add watermark to pdf",
      modality: "all",
      limit: 8,
    });

    expect(result.results[0]?.item.id).toBe("watermark-pdf");
  });

  it("does not treat extract pages from pdf as conversion intent", () => {
    const result = searchTools(realTools, {
      query: "extract pages from pdf",
      modality: "all",
      limit: 8,
    });

    expect(result.results[0]?.item.id).toBe("extract-pages");
  });
});

describe("buildToolRequestDiscussionUrl", () => {
  it("builds an Ideas discussion URL with encoded title and body", () => {
    const url = new URL(buildToolRequestDiscussionUrl("convert figma file to layered psd"));
    expect(url.origin + url.pathname).toBe(
      "https://github.com/snapotter-hq/snapotter/discussions/new",
    );
    expect(url.searchParams.get("category")).toBe("ideas");
    expect(url.searchParams.get("title")).toBe("Tool request: convert figma file to layered psd");
    expect(url.searchParams.get("body")).toContain(
      "I searched SnapOtter for:\n\n> convert figma file to layered psd",
    );
    expect(url.searchParams.get("body")).not.toContain("I searched SnapOtter for: `");
  });

  it("strips title newlines and collapses whitespace", () => {
    const url = new URL(buildToolRequestDiscussionUrl("  convert\n\nfoo\tto   bar  "));
    expect(url.searchParams.get("title")).toBe("Tool request: convert foo to bar");
  });

  it("truncates long title queries", () => {
    const long = "x".repeat(200);
    const url = new URL(buildToolRequestDiscussionUrl(long));
    expect(url.searchParams.get("title")).toBe(`Tool request: ${"x".repeat(120)}`);
    expect(url.searchParams.get("body")).toContain("x".repeat(200));
  });

  it("uses a generic title for empty queries", () => {
    const url = new URL(buildToolRequestDiscussionUrl("   "));
    expect(url.searchParams.get("title")).toBe("Tool request");
    expect(url.searchParams.get("body")).not.toContain("I searched SnapOtter for:");
  });

  it("renders backtick queries without an inline code span", () => {
    const url = new URL(buildToolRequestDiscussionUrl("convert `pdf` to docx"));
    expect(url.searchParams.get("body")).toContain(
      "I searched SnapOtter for:\n\n> convert `pdf` to docx",
    );
    expect(url.searchParams.get("body")).not.toContain("I searched SnapOtter for: `");
  });
});
