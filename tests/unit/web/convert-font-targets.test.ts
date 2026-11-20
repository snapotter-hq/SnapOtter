import { describe, expect, it } from "vitest";
import { fontTargets } from "@/components/tools/convert-font-settings";

describe("convert-font output choices", () => {
  it("never offers the input's own format", () => {
    for (const ext of ["ttf", "otf", "woff", "woff2"]) {
      expect(fontTargets(ext)).not.toContain(ext);
      expect(fontTargets(ext)).toHaveLength(3);
    }
  });

  it("puts WOFF2 first for a TTF and TTF first for an OTF", () => {
    expect(fontTargets("ttf")).toEqual(["woff2", "otf", "woff"]);
    expect(fontTargets("otf")).toEqual(["ttf", "woff", "woff2"]);
  });

  it("offers every format when the extension is unknown", () => {
    expect(fontTargets(undefined)).toEqual(["ttf", "otf", "woff", "woff2"]);
  });
});
