import type { TranslationKeys } from "@snapotter/shared";

/**
 * FEATURE_BUNDLES carries English names and descriptions as data, and the API
 * serves them as-is. Display strings come from the featureBundles namespace,
 * keyed by bundle id, falling back to the server's string for ids the locale
 * files don't know (custom bundles, or a newer API than this client).
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
