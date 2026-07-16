import type { SupportedLocale, TranslationKeys } from "@snapotter/shared";
import { en, SUPPORTED_LOCALES } from "@snapotter/shared";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type LocaleModule = Record<string, TranslationKeys>;

const localeLoaders: Record<string, () => Promise<LocaleModule>> = {
  "zh-CN": () => import("@snapotter/shared/i18n/zh-CN.js") as Promise<LocaleModule>,
  "zh-TW": () => import("@snapotter/shared/i18n/zh-TW.js") as Promise<LocaleModule>,
  ja: () => import("@snapotter/shared/i18n/ja.js") as Promise<LocaleModule>,
  ko: () => import("@snapotter/shared/i18n/ko.js") as Promise<LocaleModule>,
  es: () => import("@snapotter/shared/i18n/es.js") as Promise<LocaleModule>,
  fr: () => import("@snapotter/shared/i18n/fr.js") as Promise<LocaleModule>,
  it: () => import("@snapotter/shared/i18n/it.js") as Promise<LocaleModule>,
  "pt-BR": () => import("@snapotter/shared/i18n/pt-BR.js") as Promise<LocaleModule>,
  de: () => import("@snapotter/shared/i18n/de.js") as Promise<LocaleModule>,
  nl: () => import("@snapotter/shared/i18n/nl.js") as Promise<LocaleModule>,
  sv: () => import("@snapotter/shared/i18n/sv.js") as Promise<LocaleModule>,
  ru: () => import("@snapotter/shared/i18n/ru.js") as Promise<LocaleModule>,
  pl: () => import("@snapotter/shared/i18n/pl.js") as Promise<LocaleModule>,
  uk: () => import("@snapotter/shared/i18n/uk.js") as Promise<LocaleModule>,
  ar: () => import("@snapotter/shared/i18n/ar.js") as Promise<LocaleModule>,
  tr: () => import("@snapotter/shared/i18n/tr.js") as Promise<LocaleModule>,
  hi: () => import("@snapotter/shared/i18n/hi.js") as Promise<LocaleModule>,
  vi: () => import("@snapotter/shared/i18n/vi.js") as Promise<LocaleModule>,
  id: () => import("@snapotter/shared/i18n/id.js") as Promise<LocaleModule>,
  th: () => import("@snapotter/shared/i18n/th.js") as Promise<LocaleModule>,
};

async function loadLocale(code: string): Promise<TranslationKeys> {
  if (code === "en") return en;
  const loader = localeLoaders[code];
  if (!loader) return en;
  try {
    const mod = await loader();
    const camelCode = code.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
    return (mod[camelCode] ?? mod[code] ?? en) as TranslationKeys;
  } catch {
    return en;
  }
}

type I18nContextValue = {
  t: TranslationKeys;
  locale: string;
  dir: "ltr" | "rtl";
  setLocale: (code: string) => void;
  supportedLocales: SupportedLocale[];
};

const I18nContext = createContext<I18nContextValue>({
  t: en,
  locale: "en",
  dir: "ltr",
  setLocale: () => {},
  supportedLocales: SUPPORTED_LOCALES,
});

const LOCALE_STORAGE_KEY = "snapotter-locale";

function detectLocale(): string {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored) return stored;

  const codes = SUPPORTED_LOCALES.map((l) => l.code);
  for (const browserLang of navigator.languages) {
    if (codes.includes(browserLang)) return browserLang;
    const prefix = browserLang.split("-")[0];
    const match = codes.find((c) => c === prefix || c.startsWith(`${prefix}-`));
    if (match) return match;
  }

  return "en";
}

async function fetchInstanceDefault(): Promise<string> {
  try {
    const res = await fetch("/api/v1/config/locale");
    if (res.ok) {
      const data = await res.json();
      if (data.defaultLocale && data.defaultLocale !== "en") {
        return data.defaultLocale;
      }
    }
  } catch {
    // Server unreachable
  }
  return "en";
}

function getDir(code: string): "ltr" | "rtl" {
  return SUPPORTED_LOCALES.find((l) => l.code === code)?.dir ?? "ltr";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(() => detectLocale());
  const [translations, setTranslations] = useState<TranslationKeys>(en);
  const dir = getDir(locale);

  useEffect(() => {
    const hasExplicitChoice = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (hasExplicitChoice) return;

    if (detectLocale() !== "en") return;

    let cancelled = false;
    fetchInstanceDefault().then((instanceLocale) => {
      if (!cancelled && instanceLocale !== "en") {
        setLocaleState(instanceLocale);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Tag Sentry with the active locale so locale-specific i18n/interpolation
    // crashes are identifiable as such.
    import("@/lib/analytics").then(({ setSentryTag }) => setSentryTag("locale", locale));
    loadLocale(locale).then((t) => {
      if (!cancelled) setTranslations(t);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((code: string) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
    setLocaleState(code);
  }, []);

  return (
    <I18nContext.Provider
      value={{
        t: translations,
        locale,
        dir,
        setLocale,
        supportedLocales: SUPPORTED_LOCALES,
      }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export const useTranslation = () => useContext(I18nContext);
