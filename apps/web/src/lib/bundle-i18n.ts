import type { TranslationKeys } from "@snapotter/shared";
import { format } from "@/lib/format";

/**
 * FEATURE_BUNDLES carries English names and descriptions as data, and the API
 * serves them as-is. Display strings come from the featureBundles namespace,
 * keyed by bundle id, falling back to the server's string for ids the locale
 * files don't know (an API newer than this client).
 */

type BundleLabels = { id: string; name: string; description: string };

function entry(t: TranslationKeys, id: string): { name?: string; description?: string } {
  return (t.featureBundles as Record<string, { name?: string; description?: string }>)[id] ?? {};
}

export function bundleName(t: TranslationKeys, bundle: Pick<BundleLabels, "id" | "name">): string {
  return entry(t, bundle.id).name ?? bundle.name;
}

export function bundleDescription(
  t: TranslationKeys,
  bundle: Pick<BundleLabels, "id" | "description">,
): string {
  return entry(t, bundle.id).description ?? bundle.description;
}

/**
 * The message for a 501 FEATURE_NOT_INSTALLED answer. The API names the
 * bundle by id (`feature`) and in English (`featureName`); the id wins so the
 * user reads the bundle in their own language. Pass the already-translated
 * tool name when the failure belongs to one tool rather than a pipeline.
 */
export function featureNotInstalledMessage(
  t: TranslationKeys,
  error: { feature: string; featureName: string },
  toolName?: string,
): string {
  const feature = bundleName(t, { id: error.feature, name: error.featureName });
  return toolName === undefined
    ? format(t.errors.featureNotInstalled, { feature })
    : format(t.errors.featureNotInstalledForTool, { tool: toolName, feature });
}

/**
 * The message for a 501 FEATURE_INCOMPATIBLE answer (#1438). Fast OCR with
 * Korean and Arabic carry their own localized guidance; hardware and runtime
 * incompatibilities name the bundle in the active locale.
 */
export function featureIncompatibleMessage(
  t: TranslationKeys,
  error: { feature: string; featureName: string; compatibilityReason?: string },
): string {
  if (error.compatibilityReason === "fast-korean-unsupported") {
    return t.toolSettings.ocr.fastKoreanUnsupported;
  }
  if (error.compatibilityReason === "fast-arabic-unsupported") {
    return t.toolSettings.ocr.fastArabicUnsupported;
  }
  const feature = bundleName(t, { id: error.feature, name: error.featureName });
  return format(t.errors.featureIncompatible, { feature });
}
