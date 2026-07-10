// tests/unit/scripts/i18n/slugify.test.ts
import { describe, expect, it } from "vitest";
import { slugify } from "../../../../scripts/i18n/lib/slugify.mjs";

describe("slugify (VitePress/mdit-vue parity)", () => {
  it("lowercases and dashes spaces", () => {
    expect(slugify("Getting Started")).toBe("getting-started");
  });

  it("collapses punctuation runs to a single dash and trims", () => {
    expect(slugify("File Processing (241 Tools)")).toBe("file-processing-241-tools");
    expect(slugify("REST API & API Keys")).toBe("rest-api-api-keys");
  });

  it("strips combining marks via NFKD", () => {
    expect(slugify("Café Details")).toBe("cafe-details");
  });

  it("prefixes a leading digit with underscore", () => {
    expect(slugify("3 Steps")).toBe("_3-steps");
  });

  it("handles a plain two-word heading", () => {
    expect(slugify("Quick Start")).toBe("quick-start");
  });
});
