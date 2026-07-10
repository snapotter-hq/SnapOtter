// tests/unit/scripts/i18n/mask.test.ts
import { describe, expect, it } from "vitest";
import { countStructures, mask, restore } from "../../../../scripts/i18n/lib/mask.mjs";

describe("mask/restore", () => {
  it("round-trips arbitrary markdown exactly", () => {
    const src = [
      "Upload a `file` then run:",
      "",
      "```bash",
      "curl -X POST /api/v1/tools/image/convert",
      "```",
      "",
      "See ![diagram](/img/x.png) and [the guide](/guide/x).",
      "Greeting: {username}, you have {count} files.",
    ].join("\n");
    const { masked, tokens } = mask(src);
    expect(restore(masked, tokens)).toBe(src);
  });

  it("hides code, link URLs, and placeholders from the masked text", () => {
    const { masked } = mask("Run `x` see [t](/u) for {name}");
    expect(masked).not.toContain("`x`");
    expect(masked).not.toContain("/u");
    expect(masked).not.toContain("{name}");
    expect(masked).toContain("[t]"); // link TEXT stays translatable
  });

  it("countStructures counts fences, inline code, links/images, placeholders", () => {
    const src = "```\nc\n```\n`a` `b` [l](/x) ![i](/y) {p}";
    expect(countStructures(src)).toEqual({ fences: 1, inlineCode: 2, links: 2, placeholders: 1 });
  });
});
