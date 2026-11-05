/**
 * The collage description once promised "25+ templates" while the code defined
 * 23 (#4339). Public copy states no template count, so it can't drift again.
 */

import { en, TOOLS, TRANSLATION_LOADERS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("collage description", () => {
  it("states no template count in the shared catalog", () => {
    const tool = TOOLS.find((t) => t.id === "collage");
    expect(tool?.description).not.toMatch(/\d/);
  });

  it("states no template count in the English locale", () => {
    expect(en.tools.collage.description).not.toMatch(/\d/);
  });

  it.each(Object.keys(TRANSLATION_LOADERS))("states no template count in %s", async (locale) => {
    const messages = await TRANSLATION_LOADERS[locale]();
    expect(messages.tools.collage.description).not.toMatch(/\d/);
  });
});
