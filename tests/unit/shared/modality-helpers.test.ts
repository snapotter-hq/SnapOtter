import { describe, expect, it } from "vitest";
import { TOOLS } from "../../../packages/shared/src/constants.js";
import {
  modalityForExtension,
  toolInputModality,
  toolOutputModality,
} from "../../../packages/shared/src/modality.js";

const tool = (id: string) => {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) throw new Error(`tool ${id} not found`);
  return t;
};

describe("modalityForExtension", () => {
  it("maps extensions to their owning modality", () => {
    expect(modalityForExtension(".png")).toBe("image");
    expect(modalityForExtension(".mp4")).toBe("video");
    expect(modalityForExtension(".mp3")).toBe("audio");
    expect(modalityForExtension(".pdf")).toBe("document");
    expect(modalityForExtension(".csv")).toBe("file");
  });
  it("is case-insensitive and tolerates a missing dot", () => {
    expect(modalityForExtension("PNG")).toBe("image");
    expect(modalityForExtension(".JPG")).toBe("image");
  });
  it("returns null for unknown extensions", () => {
    expect(modalityForExtension(".xyz")).toBeNull();
  });
});

describe("toolOutputModality", () => {
  it("defaults to the tool's modality", () => {
    expect(toolOutputModality(tool("resize"))).toBe("image");
  });
  it("uses the override for crossing tools", () => {
    expect(toolOutputModality(tool("extract-audio"))).toBe("audio");
    expect(toolOutputModality(tool("chart-maker"))).toBe("image");
  });
});

describe("toolInputModality", () => {
  it("returns the tool modality for normal tools", () => {
    expect(toolInputModality(tool("trim-video"))).toBe("video");
    expect(toolInputModality(tool("compress-pdf"))).toBe("document");
  });
  it("derives the real input modality from acceptedInputs", () => {
    expect(toolInputModality(tool("gif-to-video"))).toBe("image");
    expect(toolInputModality(tool("chart-maker"))).toBe("file");
  });
});
