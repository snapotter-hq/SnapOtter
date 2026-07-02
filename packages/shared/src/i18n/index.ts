import type { TranslationKeys } from "./en.js";
import { en } from "./en.js";

export type { TranslationKeys } from "./en.js";
export { en };

export type SupportedLocale = {
  code: string;
  name: string;
  nativeName: string;
  dir: "ltr" | "rtl";
};

export const SUPPORTED_LOCALES: SupportedLocale[] = [
  { code: "en", name: "English", nativeName: "English", dir: "ltr" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文", dir: "ltr" },
  { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "繁體中文", dir: "ltr" },
  { code: "ja", name: "Japanese", nativeName: "日本語", dir: "ltr" },
  { code: "ko", name: "Korean", nativeName: "한국어", dir: "ltr" },
  { code: "es", name: "Spanish", nativeName: "Español", dir: "ltr" },
  { code: "fr", name: "French", nativeName: "Français", dir: "ltr" },
  { code: "it", name: "Italian", nativeName: "Italiano", dir: "ltr" },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)", dir: "ltr" },
  { code: "de", name: "German", nativeName: "Deutsch", dir: "ltr" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", dir: "ltr" },
  { code: "sv", name: "Swedish", nativeName: "Svenska", dir: "ltr" },
  { code: "ru", name: "Russian", nativeName: "Русский", dir: "ltr" },
  { code: "pl", name: "Polish", nativeName: "Polski", dir: "ltr" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська", dir: "ltr" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", dir: "ltr" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", dir: "ltr" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", dir: "ltr" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", dir: "ltr" },
  { code: "th", name: "Thai", nativeName: "ไทย", dir: "ltr" },
];

type TranslationLoader = () => Promise<TranslationKeys>;

const TRANSLATION_LOADERS: Record<string, TranslationLoader> = {
  ar: async () => (await import("./ar.js")).ar,
  de: async () => (await import("./de.js")).de,
  es: async () => (await import("./es.js")).es,
  fr: async () => (await import("./fr.js")).fr,
  hi: async () => (await import("./hi.js")).hi,
  id: async () => (await import("./id.js")).id,
  it: async () => (await import("./it.js")).it,
  ja: async () => (await import("./ja.js")).ja,
  ko: async () => (await import("./ko.js")).ko,
  nl: async () => (await import("./nl.js")).nl,
  pl: async () => (await import("./pl.js")).pl,
  "pt-BR": async () => (await import("./pt-BR.js")).ptBR,
  ru: async () => (await import("./ru.js")).ru,
  sv: async () => (await import("./sv.js")).sv,
  th: async () => (await import("./th.js")).th,
  tr: async () => (await import("./tr.js")).tr,
  uk: async () => (await import("./uk.js")).uk,
  vi: async () => (await import("./vi.js")).vi,
  "zh-CN": async () => (await import("./zh-CN.js")).zhCN,
  "zh-TW": async () => (await import("./zh-TW.js")).zhTW,
};

export async function loadTranslations(locale: string): Promise<TranslationKeys> {
  if (locale === "en") return en;
  const loadTranslation = TRANSLATION_LOADERS[locale];
  if (!loadTranslation) return en;
  try {
    return await loadTranslation();
  } catch {
    return en;
  }
}
