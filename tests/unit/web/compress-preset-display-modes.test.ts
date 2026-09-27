import { COMPRESS_PRESETS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { TOOL_DISPLAY_MODES } from "@/lib/tool-display-modes";

// Image presets compare before/after like compress; PDF presets (#1070) take
// compress-pdf's document view, since a PDF has no image to slide across.
describe("compress preset display modes", () => {
  it.each(COMPRESS_PRESETS.map((p) => [p.id, p.base] as const))(
    "%s follows its base %s",
    (id, base) => {
      const expected = base === "compress" ? "before-after" : TOOL_DISPLAY_MODES[base];
      expect(TOOL_DISPLAY_MODES[id]).toBe(expected);
    },
  );

  it("gives the PDF presets compress-pdf's document view", () => {
    expect(TOOL_DISPLAY_MODES["compress-pdf-to-1mb"]).toBe("document");
  });
});
