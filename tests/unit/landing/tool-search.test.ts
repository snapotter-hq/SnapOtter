import { describe, expect, it } from "vitest";
import { matchTool } from "../../../apps/landing/src/lib/tool-search.js";

// haystack = name + " " + desc + " " + keywords (all lowercase, space-joined)
const jpgPng = {
  id: "jpg-to-png",
  haystack: "jpg to png convert jpg to png jpg jpeg png jpg2png jpgtopng",
};

describe("landing matchTool", () => {
  it.each([
    "jpeg to png",
    "jpg2png",
    "jpg to png",
    "covert jpg to png", // misspelling of convert
  ])("matches %s", (q) => {
    expect(matchTool(q, jpgPng.haystack)).toBe(true);
  });

  it("typo within one edit still matches via fallback (jpge)", () => {
    expect(matchTool("jpge to png", jpgPng.haystack)).toBe(true);
  });

  it("rejects unrelated query", () => {
    expect(matchTool("trim video", jpgPng.haystack)).toBe(false);
  });
});
