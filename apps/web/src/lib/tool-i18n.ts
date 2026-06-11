import type { TranslationKeys } from "@snapotter/shared";

export function getToolName(t: TranslationKeys, toolId: string, fallback: string): string {
  const entry = (t.tools as Record<string, { name?: string }>)[toolId];
  return entry?.name ?? fallback;
}

export function getToolDescription(t: TranslationKeys, toolId: string, fallback: string): string {
  const entry = (t.tools as Record<string, { description?: string }>)[toolId];
  return entry?.description ?? fallback;
}

export function getCategoryName(t: TranslationKeys, categoryId: string, fallback: string): string {
  return (t.categories as Record<string, string>)[categoryId] ?? fallback;
}

/**
 * Returns the i18n display name for a modality group header.
 * The "document" key maps to the merged "documentsAndFiles" i18n entry;
 * "file" is never rendered as a top-level header (merged into document).
 */
export function getModalityName(t: TranslationKeys, modalityId: string, fallback: string): string {
  const key = modalityId === "document" ? "documentsAndFiles" : modalityId;
  return (t.modalities as Record<string, string>)[key] ?? fallback;
}
