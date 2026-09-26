/**
 * The dropzone and its "Import multiple URLs" dialog sit on every tool,
 * including video, audio, and PDF ones, so their copy must say "files", not
 * "images". b8b6b0a4 generalised the en strings, but the other locales kept
 * the image-only wording until #1281. The value-equality guard can't see that
 * kind of staleness, so this pins the meaning with each locale's own words for
 * "image".
 */

import { en, loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

// Lowercase stems that mean "image" in each locale. A stem, not a whole word,
// so inflected forms (Bilder, imágenes, изображения) still match.
const IMAGE_WORDS: Record<string, string[]> = {
  en: ["image"],
  ar: ["صور"],
  de: ["bild"],
  es: ["imagen", "imágen"],
  fr: ["image"],
  hi: ["इमेज", "छवि"],
  id: ["gambar"],
  it: ["immagin"],
  ja: ["画像"],
  ko: ["이미지"],
  nl: ["afbeelding"],
  pl: ["obraz"],
  "pt-BR": ["imagem", "imagens"],
  ru: ["изображ"],
  sv: ["bild"],
  th: ["ภาพ", "รูป"],
  tr: ["görüntü", "görsel"],
  uk: ["зображ"],
  vi: ["ảnh"],
  "zh-CN": ["图片", "图像"],
  "zh-TW": ["影像", "圖片"],
};

type Catalog = typeof en;

const FILE_GENERIC_STRINGS: [string, (t: Catalog) => string][] = [
  ["dropzone.dropPrompt", (t) => t.dropzone.dropPrompt],
  ["dropzone.urlPlaceholder", (t) => t.dropzone.urlPlaceholder],
  ["dropzone.urlFetchFailed", (t) => t.dropzone.urlFetchFailed],
  ["urlImport.placeholder", (t) => t.urlImport.placeholder],
];

describe("dropzone copy says files, not images (#1281)", () => {
  it("has an image-word list for every supported locale", () => {
    expect(Object.keys(IMAGE_WORDS).sort()).toEqual(SUPPORTED_LOCALES.map((l) => l.code).sort());
  });

  it.each(SUPPORTED_LOCALES.map((l) => [l.code]))("%s", async (code) => {
    const t = (code === "en" ? en : await loadTranslations(code)) as Catalog;
    for (const [key, pick] of FILE_GENERIC_STRINGS) {
      const value = pick(t).toLocaleLowerCase();
      for (const word of IMAGE_WORDS[code]) {
        expect(value, `${code} ${key} = "${pick(t)}" still says "${word}"`).not.toContain(word);
      }
    }
  });
});
