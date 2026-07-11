// apps/landing/src/lib/tool-strings.ts
import { loadTranslations } from "@snapotter/shared";

/** Translated tool name/description for a locale, keyed by toolId. */
export async function loadToolStrings(
  locale: string,
): Promise<Record<string, { name: string; description: string }>> {
  const dict = await loadTranslations(locale);
  return (
    (dict as unknown as { tools?: Record<string, { name: string; description: string }> }).tools ??
    {}
  );
}
