import type { SupportedLocale, TranslationKeys } from "@snapotter/shared";
import { en, SafeError, SUPPORTED_LOCALES } from "@snapotter/shared";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { appUrl } from "@/lib/app-url";

export type LocaleModule = Record<string, TranslationKeys>;

export const localeLoaders: Record<string, () => Promise<LocaleModule>> = {
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

export async function loadLocale(code: string): Promise<TranslationKeys> {
  if (code === "en") return en;
  const loader = localeLoaders[code];
  if (!loader) return en;
  try {
    const mod = await loader();
    const camelCode = code.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
    return (mod[camelCode] ?? mod[code] ?? en) as TranslationKeys;
  } catch (error) {
    console.error("Failed to load locale chunk", { locale: code, error });
    try {
      const { captureHandledError } = await import("@/lib/analytics");
      await captureHandledError(
        new SafeError("Locale chunk failed to load", {
          code: `locale-${code}`,
          cause: error,
        }),
        { locale: code, error_class: "operational" },
      );
    } catch {
      // analytics import or reporting unavailable
    }
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
const SUPPORTED_CODES = SUPPORTED_LOCALES.map((l) => l.code);

function resolveSupportedLocale(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  const normalized = candidate.trim().replace(/_/g, "-");
  if (!normalized) return null;
  if (SUPPORTED_CODES.includes(normalized)) return normalized;
  const lower = normalized.toLowerCase();
  const caseMatch = SUPPORTED_CODES.find((c) => c.toLowerCase() === lower);
  if (caseMatch) return caseMatch;
  const subtags = lower.split("-");
  const prefix = subtags[0];
  if (prefix === "zh") {
    return subtags.includes("hant") ||
      subtags.includes("tw") ||
      subtags.includes("hk") ||
      subtags.includes("mo")
      ? "zh-TW"
      : "zh-CN";
  }
  return (
    SUPPORTED_CODES.find((c) => {
      const codeLower = c.toLowerCase();
      return codeLower === prefix || codeLower.startsWith(`${prefix}-`);
    }) ?? null
  );
}

function readStoredLocale(): string | null {
  try {
    return resolveSupportedLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch (error) {
    console.warn("Failed to read locale preference from browser storage.", error);
    return null;
  }
}

function detectBrowserLocale(): string {
  for (const browserLang of navigator.languages ?? []) {
    const match = resolveSupportedLocale(browserLang);
    if (match) return match;
  }
  return "en";
}

function detectLocale(): string {
  return readStoredLocale() ?? detectBrowserLocale();
}

async function fetchInstanceDefault(): Promise<string> {
  try {
    const res = await fetch(appUrl("/api/v1/config/locale"));
    if (res.ok) {
      const data = await res.json();
      const resolved = resolveSupportedLocale(data?.defaultLocale);
      if (resolved && resolved !== "en") {
        return resolved;
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
  const hasExplicitChoiceRef = useRef(false);
  const dir = getDir(locale);

  // biome-ignore lint/correctness/useExhaustiveDependencies: instance default only checked once on initial mount
  useEffect(() => {
    if (locale !== "en" || readStoredLocale()) return;

    let cancelled = false;
    fetchInstanceDefault().then((instanceLocale) => {
      if (
        !cancelled &&
        !hasExplicitChoiceRef.current &&
        !readStoredLocale() &&
        instanceLocale !== "en"
      ) {
        setLocaleState(instanceLocale);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLocale(locale).then((t) => {
      if (cancelled) return;
      setTranslations(t);
      // Tag Sentry with the active locale so locale-specific i18n/interpolation
      // crashes are identifiable as such. When a chunk load fails and falls back
      // to English, tag as "en" so Sentry reflects what the user actually sees.
      const activeLocale = t === en && locale !== "en" ? "en" : locale;
      import("@/lib/analytics")
        .then(({ setSentryTag }) => setSentryTag("locale", activeLocale))
        .catch(() => {});
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
    hasExplicitChoiceRef.current = true;
    const resolved = resolveSupportedLocale(code) ?? "en";
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, resolved);
    } catch (error) {
      console.warn("Failed to persist locale preference to browser storage.", error);
    }
    setLocaleState(resolved);
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
