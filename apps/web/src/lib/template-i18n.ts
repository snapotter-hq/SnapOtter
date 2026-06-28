import type { TranslationKeys } from "@snapotter/shared";

export function getTemplateName(t: TranslationKeys, id: string, fallback: string): string {
  const entry = (t.pipelineTemplates as Record<string, { name?: string }>)[id];
  return entry?.name ?? fallback;
}

export function getTemplateDescription(t: TranslationKeys, id: string, fallback: string): string {
  const entry = (t.pipelineTemplates as Record<string, { description?: string }>)[id];
  return entry?.description ?? fallback;
}
