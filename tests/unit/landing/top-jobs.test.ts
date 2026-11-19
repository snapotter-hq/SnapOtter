import { TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { TOP_JOBS, topJobPath } from "../../../apps/landing/src/lib/top-jobs.js";

describe("homepage top-job links (#5011)", () => {
  it("lists the six most-used jobs in order", () => {
    expect(TOP_JOBS).toEqual([
      "remove-background",
      "compress-pdf",
      "convert",
      "resize",
      "merge-pdf",
      "ocr",
    ]);
  });

  it("points every link at that tool's landing page", () => {
    for (const id of TOP_JOBS) {
      const tool = TOOLS.find((t) => t.id === id);
      if (!tool) throw new Error(`${id} is not in TOOLS`);
      expect(topJobPath(id)).toBe(`/tools/${toolSection(tool)}/${id}/`);
    }
    expect(topJobPath("remove-background")).toBe("/tools/image/remove-background/");
    expect(topJobPath("compress-pdf")).toBe("/tools/pdf/compress-pdf/");
  });
});
