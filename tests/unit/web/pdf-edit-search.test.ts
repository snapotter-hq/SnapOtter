import { TOOLS } from "@snapotter/shared";
import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";
import { FUSE_OPTIONS, searchToolList } from "@/hooks/use-fuse-search";

// Runs the same config and pipeline the app ships, imported rather than
// copied, so a ranking change in production cannot pass here on a stale copy.
function search(q: string): string[] {
  return searchToolList(new Fuse(TOOLS, FUSE_OPTIONS), TOOLS, q).map((tool) => tool.id);
}

const PDF_EDIT_TOOLS = new Set(TOOLS.filter((t) => t.category === "pdf-edit").map((t) => t.id));

describe("PDF editing discoverability (#733)", () => {
  it("'edit pdf' surfaces the PDF editing suite", () => {
    const results = search("edit pdf");
    // Reported symptom: this returned no useful results (only converters that
    // end in "-pdf"), so the user concluded the feature did not exist.
    expect(results.length).toBeGreaterThanOrEqual(3);
    // The top few hits are all genuine PDF editing tools, not converters that
    // merely end in "-pdf".
    for (const id of results.slice(0, 3)) {
      expect(PDF_EDIT_TOOLS.has(id)).toBe(true);
    }
    expect(results).toContain("sign-pdf");
  });

  it("'modify pdf' surfaces the PDF editing suite", () => {
    const results = search("modify pdf");
    expect(results.slice(0, 3).some((id) => PDF_EDIT_TOOLS.has(id))).toBe(true);
  });

  it("'annotate pdf' leads to the annotate/sign tool", () => {
    expect(search("annotate pdf").slice(0, 3)).toContain("sign-pdf");
  });

  it("'annotate' leads to the annotate/sign tool", () => {
    expect(search("annotate").slice(0, 5)).toContain("sign-pdf");
  });

  it("'pdf editor' leads to the annotate/sign tool", () => {
    expect(search("pdf editor").slice(0, 5)).toContain("sign-pdf");
  });

  // Regression guards: the generic edit keywords must not steal more specific
  // PDF searches.
  it.each([
    ["rotate pdf", "rotate-pdf"],
    ["sign pdf", "sign-pdf"],
    ["watermark pdf", "watermark-pdf"],
    ["redact pdf", "redact-pdf"],
    ["compress pdf", "compress-pdf"],
  ])("'%s' still ranks %s first", (q, id) => {
    expect(search(q)[0]).toBe(id);
  });

  it("'edit metadata' still resolves to a metadata tool, not a PDF editor", () => {
    // The generic "edit pdf" keyword must not hijack a metadata search: the
    // top hit stays a metadata tool (the specific one is a pre-existing
    // ranking detail this fix must not change).
    const top = search("edit metadata")[0];
    expect(top).toMatch(/metadata/);
    expect(PDF_EDIT_TOOLS.has(top)).toBe(false);
  });
});
