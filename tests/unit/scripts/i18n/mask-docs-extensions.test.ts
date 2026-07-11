// tests/unit/scripts/i18n/mask-docs-extensions.test.ts
import { describe, expect, it } from "vitest";
import { countStructures, mask, restore } from "../../../../scripts/i18n/lib/mask.mjs";

describe("mask: balanced-paren link URLs", () => {
  it("round-trips a link whose URL contains balanced parentheses", () => {
    const src = "See [the article](https://en.wikipedia.org/wiki/Foo_(bar)) for detail.";
    const { masked, tokens } = mask(src);
    expect(restore(masked, tokens)).toBe(src);
  });

  it("masks the WHOLE url including its inner parens, keeping the link intact", () => {
    const src = "See [the article](https://en.wikipedia.org/wiki/Foo_(bar)) done.";
    const { masked } = mask(src);
    // The full URL is hidden; no fragment of it leaks into translatable text.
    expect(masked).not.toContain("wikipedia");
    expect(masked).not.toContain("(bar)");
    // Link text stays translatable, and exactly one closing paren remains (the link's).
    expect(masked).toContain("[the article]");
    expect(masked.match(/\)/g)?.length ?? 0).toBe(1);
  });

  it("counts a paren-URL link as one link", () => {
    const src = "[a](https://x.test/A_(b)) and [c](/d)";
    expect(countStructures(src).links).toBe(2);
  });
});

describe("mask: double-brace placeholders", () => {
  it("round-trips and hides the entire {{token}} not just the inner {x}", () => {
    const src = "Pattern is {{padded}} then {{index}}.";
    const { masked, tokens } = mask(src);
    expect(restore(masked, tokens)).toBe(src);
    expect(masked).not.toContain("{{padded}}");
    expect(masked).not.toContain("{padded}"); // inner must not leak either
  });

  it("counts each {{token}} as one placeholder", () => {
    expect(countStructures("{{a}} {{b}} {c}").placeholders).toBe(3);
  });

  it("still masks single-brace {var} placeholders", () => {
    const { masked } = mask("Hi {name}");
    expect(masked).not.toContain("{name}");
  });
});
