import { describe, expect, it } from "vitest";
import { rewriteToolPaths } from "../../../scripts/lib/rewrite-tool-paths.js";

const MAP: Record<string, string> = {
  crop: "image",
  "crop-video": "video",
  convert: "image",
  "convert-video": "video",
  ocr: "image",
  "ocr-pdf": "pdf",
  resize: "image",
  "passport-photo": "image",
  "strip-metadata": "image",
};

describe("rewriteToolPaths", () => {
  it("inserts the section as a full segment", () => {
    expect(rewriteToolPaths(`fetch("/api/v1/tools/crop")`, MAP)).toBe(
      `fetch("/api/v1/tools/image/crop")`,
    );
  });

  it("does NOT corrupt prefix-colliding ids", () => {
    expect(rewriteToolPaths("/api/v1/tools/convert-video", MAP)).toBe(
      "/api/v1/tools/video/convert-video",
    );
    expect(rewriteToolPaths("/api/v1/tools/ocr-pdf", MAP)).toBe("/api/v1/tools/pdf/ocr-pdf");
  });

  it("handles sub-routes and YAML path keys", () => {
    expect(rewriteToolPaths("/api/v1/tools/passport-photo/analyze", MAP)).toBe(
      "/api/v1/tools/image/passport-photo/analyze",
    );
    expect(rewriteToolPaths("  /api/v1/tools/resize:", MAP)).toBe("  /api/v1/tools/image/resize:");
    expect(rewriteToolPaths("/api/v1/tools/strip-metadata/inspect", MAP)).toBe(
      "/api/v1/tools/image/strip-metadata/inspect",
    );
  });

  it("matches inside backtick template literals", () => {
    expect(rewriteToolPaths("`/api/v1/tools/resize`", MAP)).toBe("`/api/v1/tools/image/resize`");
  });

  it("leaves parametric placeholders and wildcards untouched", () => {
    expect(rewriteToolPaths("/api/v1/tools/:toolId/batch", MAP)).toBe(
      "/api/v1/tools/:toolId/batch",
    );
    expect(rewriteToolPaths("/api/v1/tools/{toolId}/batch", MAP)).toBe(
      "/api/v1/tools/{toolId}/batch",
    );
    expect(rewriteToolPaths("**/api/v1/tools/**", MAP)).toBe("**/api/v1/tools/**");
  });

  it("rewrites the id inside a glob", () => {
    expect(rewriteToolPaths("**/api/v1/tools/resize", MAP)).toBe("**/api/v1/tools/image/resize");
  });

  it("is idempotent", () => {
    const once = rewriteToolPaths("/api/v1/tools/convert", MAP);
    expect(rewriteToolPaths(once, MAP)).toBe(once);
    expect(once).toBe("/api/v1/tools/image/convert");
  });

  it("rewrites multiple distinct ids on one line", () => {
    expect(rewriteToolPaths(`"/api/v1/tools/crop" then "/api/v1/tools/resize"`, MAP)).toBe(
      `"/api/v1/tools/image/crop" then "/api/v1/tools/image/resize"`,
    );
  });

  it("leaves unknown ids untouched", () => {
    expect(rewriteToolPaths("/api/v1/tools/nonexistent-tool", MAP)).toBe(
      "/api/v1/tools/nonexistent-tool",
    );
  });

  it("treats ) and , as segment boundaries (prose/comments)", () => {
    expect(rewriteToolPaths("see (/api/v1/tools/crop) for details", MAP)).toBe(
      "see (/api/v1/tools/image/crop) for details",
    );
    expect(rewriteToolPaths("endpoints /api/v1/tools/crop, /api/v1/tools/resize", MAP)).toBe(
      "endpoints /api/v1/tools/image/crop, /api/v1/tools/image/resize",
    );
  });

  it("throws if an id is also a section slug (idempotency invariant)", () => {
    expect(() => rewriteToolPaths("x", { image: "image" })).toThrow(/idempotency/);
  });
});
