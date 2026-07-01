import { describe, expect, it } from "vitest";
import { buildToolRequestDiscussionUrl } from "@/lib/tool-request";

describe("buildToolRequestDiscussionUrl", () => {
  it("targets the Ideas discussions category on the SnapOtter repo", () => {
    const url = new URL(buildToolRequestDiscussionUrl("convert to dicom"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://github.com/snapotter-hq/snapotter/discussions/new",
    );
    expect(url.searchParams.get("category")).toBe("ideas");
  });

  it("embeds the query in the title and body", () => {
    const url = new URL(buildToolRequestDiscussionUrl("convert to dicom"));
    expect(url.searchParams.get("title")).toContain("convert to dicom");
    expect(url.searchParams.get("body")).toContain("convert to dicom");
  });

  it("clamps an over-long query to 200 characters", () => {
    const url = new URL(buildToolRequestDiscussionUrl("a".repeat(500)));
    expect(url.searchParams.get("title")).toBe(`Tool request: ${"a".repeat(200)}`);
  });

  it("collapses newlines in the query", () => {
    const url = new URL(buildToolRequestDiscussionUrl("line one\nline two"));
    expect(url.searchParams.get("title")).toBe("Tool request: line one line two");
  });
});
