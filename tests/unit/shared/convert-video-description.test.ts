/**
 * The convert-video route accepts mp4, mov, webm, avi and mkv (#4291), so the
 * catalog and every locale's card description must name all five.
 */

import { en, TOOLS, TRANSLATION_LOADERS } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const FORMATS = ["MP4", "MOV", "WebM", "AVI", "MKV"];

function expectAllFormats(description: string) {
  for (const format of FORMATS) expect(description).toContain(format);
}

describe("convert-video description", () => {
  it("names every output format in the shared catalog", () => {
    const tool = TOOLS.find((t) => t.id === "convert-video");
    expectAllFormats(tool?.description ?? "");
  });

  it("names every output format in the English locale", () => {
    expectAllFormats(en.tools["convert-video"].description);
  });

  it.each(Object.keys(TRANSLATION_LOADERS))("names every output format in %s", async (locale) => {
    const messages = await TRANSLATION_LOADERS[locale]();
    expectAllFormats(messages.tools["convert-video"].description);
  });
});
