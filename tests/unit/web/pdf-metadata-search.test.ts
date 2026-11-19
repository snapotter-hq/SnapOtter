import { TOOLS } from "@snapotter/shared";
import Fuse from "fuse.js";
import { describe, expect, it } from "vitest";
import { FUSE_OPTIONS, searchToolList } from "@/hooks/use-fuse-search";

function search(q: string): string[] {
  return searchToolList(new Fuse(TOOLS, FUSE_OPTIONS), TOOLS, q).map((tool) => tool.id);
}

describe("PDF metadata removal discoverability (#4837)", () => {
  it.each(["remove pdf metadata", "strip pdf metadata", "clean pdf"])(
    "'%s' ranks pdf-metadata first",
    (q) => {
      expect(search(q)[0]).toBe("pdf-metadata");
    },
  );

  it("'remove metadata' offers pdf-metadata alongside the image tool", () => {
    // The reported search: it used to surface only image tools.
    expect(search("remove metadata").slice(0, 3)).toContain("pdf-metadata");
  });

  it("'remove image metadata' still ranks the image tool first", () => {
    expect(search("remove image metadata")[0]).toBe("strip-metadata");
  });
});
