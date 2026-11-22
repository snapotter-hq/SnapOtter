/**
 * Since #4370 trim-video's default mode already starts on the exact frame, so
 * `precise` only buys an exact end frame and a full re-encode. The checkbox
 * label, the translated docs pages and the translated OpenAPI copies all used
 * to say the default snapped to a keyframe (#4953).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "../../../packages/shared/src/i18n/index.js";
import { makeApiSpecAdapter } from "../../../scripts/i18n/adapters/api-spec.mjs";
import { createDocsAdapter } from "../../../scripts/i18n/adapters/docs-md.mjs";
import { hash } from "../../../scripts/i18n/lib/hash.mjs";

const LOCALES = SUPPORTED_LOCALES.map((l) => l.code).filter((code) => code !== "en");
const DOC_ID = "tools/video/trim-video.md";
const API_ID =
  "ptr:/paths/~1api~1v1~1tools~1video~1trim-video/post/requestBody/content/multipart~1form-data/schema/properties/settings/description";

// The labels that promised frame accuracy as if the default lacked it.
const OLD_LABELS: Record<string, string> = {
  en: "Frame-accurate (re-encodes)",
  ar: "دقة الإطار (إعادة ترميز)",
  de: "Bildgenau (neu kodiert)",
  es: "Preciso por fotograma (recodifica)",
  fr: "Coupe précise (réencodage)",
  hi: "फ़्रेम-सटीक (री-एनकोड)",
  id: "Akurat per frame (encoding ulang)",
  it: "Precisione al fotogramma (ricodifica)",
  ja: "フレーム単位 (再エンコード)",
  ko: "프레임 정밀 (재인코딩)",
  nl: "Framenauwkeurig (herencodeert)",
  pl: "Dokładność klatkowa (ponowne kodowanie)",
  "pt-BR": "Preciso por quadro (recodifica)",
  ru: "Покадровая точность (перекодировка)",
  sv: "Bildruteexakt (omkodas)",
  th: "แม่นยำระดับเฟรม (เข้ารหัสใหม่)",
  tr: "Kare hassasiyetinde (yeniden kodlar)",
  uk: "Покадрова точність (перекодування)",
  vi: "Chính xác từng khung hình (mã hóa lại)",
  "zh-CN": "逐帧精确（重新编码）",
  "zh-TW": "逐幀精準（重新編碼）",
};

async function preciseLabel(code: string): Promise<string> {
  const mod = (await import(`../../../packages/shared/src/i18n/${code}.ts`)) as Record<
    string,
    { toolSettings: Record<string, Record<string, string>> }
  >;
  const locale = Object.values(mod).find((v) => v && typeof v === "object" && "toolSettings" in v);
  const label = locale?.toolSettings["trim-video"]?.precise;
  if (!label) throw new Error(`${code} has no toolSettings.trim-video.precise`);
  return label;
}

describe("trim-video precise checkbox label (#4953)", () => {
  it("says the end frame is what precise adds", async () => {
    expect(await preciseLabel("en")).toBe("Exact end frame (re-encodes the whole clip)");
  });

  it.each(Object.keys(OLD_LABELS))("%s no longer uses the frame-accurate label", async (code) => {
    expect(await preciseLabel(code)).not.toBe(OLD_LABELS[code]);
  });
});

// The pipeline's stamps are the only thing that ties a translation to the
// English it came from: sourceHash says which English, outputHash says the
// stored text is the text that was stamped.
describe.each([
  ["docs page", DOC_ID, () => createDocsAdapter()],
  ["OpenAPI settings description", API_ID, () => makeApiSpecAdapter()],
] as const)("trim-video %s translations (#4953)", (_label, id, makeAdapter) => {
  const adapter = makeAdapter();
  let englishHash = "";

  beforeAll(async () => {
    const units = await adapter.extract();
    const unit = units.find((u: { id: string }) => u.id === id);
    expect(unit).toBeDefined();
    englishHash = hash(unit?.sourceText ?? "");
  });

  it.each(LOCALES)("%s was translated from the current English", async (locale) => {
    const entry = (await adapter.load(locale)).get(id);
    expect(entry).toBeDefined();
    expect(entry?.sourceHash).toBe(englishHash);
    expect(entry?.outputHash).toBe(hash(entry?.text ?? ""));
  });
});
