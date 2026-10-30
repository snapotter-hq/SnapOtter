import { FEATURE_BUNDLES, OCR_FAST_UNSUPPORTED_LANGUAGES } from "@snapotter/shared";
import { Download, Loader2 } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useAuth } from "@/hooks/use-auth";
import { bundleName, featureIncompatibleMessage } from "@/lib/bundle-i18n";
import { format, formatFileSize } from "@/lib/format";
import { useFeaturesStore } from "@/stores/features-store";

export type OcrQuality = "fast" | "balanced" | "best";

function requiresAccurateTier(language: string): boolean {
  return (OCR_FAST_UNSUPPORTED_LANGUAGES as readonly string[]).includes(language);
}

export function useOcrQuality(language = "auto"): {
  quality: OcrQuality;
  setQuality: (quality: OcrQuality) => void;
  canRun: boolean;
} {
  const [selection, setSelection] = useState<{
    language: string;
    quality: OcrQuality;
  } | null>(null);
  const bundle = useFeaturesStore((state) => state.bundles.find((item) => item.id === "ocr"));
  const bestAvailable = bundle?.availableQualities?.includes("best") ?? false;
  const balancedAvailable = bundle?.availableQualities?.includes("balanced") ?? false;
  const accurateOnly = requiresAccurateTier(language);
  const selected = selection?.language === language ? selection.quality : null;
  const accurateDefault: OcrQuality = bestAvailable
    ? "best"
    : balancedAvailable
      ? "balanced"
      : "best";
  const ordinaryDefault: OcrQuality = bestAvailable
    ? "best"
    : balancedAvailable
      ? "balanced"
      : "fast";
  const quality = accurateOnly
    ? selected && selected !== "fast"
      ? selected
      : accurateDefault
    : (selected ?? ordinaryDefault);
  const canRun =
    (!accurateOnly || quality !== "fast") &&
    (quality === "fast" || (bundle?.availableQualities?.includes(quality) ?? false));
  const setQuality = useCallback(
    (nextQuality: OcrQuality) => {
      if (accurateOnly && nextQuality === "fast") return;
      setSelection({ language, quality: nextQuality });
    },
    [accurateOnly, language],
  );
  return { quality, setQuality, canRun };
}

export function OcrQualityControl({
  quality,
  language = "auto",
  onChange,
}: {
  quality: OcrQuality;
  language?: string;
  onChange: (quality: OcrQuality) => void;
}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const bundle = useFeaturesStore((state) => state.bundles.find((item) => item.id === "ocr"));
  const installBundle = useFeaturesStore((state) => state.installBundle);
  const installing = useFeaturesStore((state) => state.installing.ocr);
  const queued = useFeaturesStore((state) => state.queued.includes("ocr"));
  const installError = useFeaturesStore((state) => state.errors.ocr);
  const helpId = useId();
  const accurateOnly = requiresAccurateTier(language);
  const accurateSelected = quality !== "fast";
  const accurateAvailable = bundle?.availableQualities?.includes(quality) ?? false;
  const needsPack = accurateSelected && !accurateAvailable;
  const isAdmin = hasPermission("features:manage");
  const incompatible = bundle?.compatibility === "incompatible";
  const displayedError = installError ?? (!incompatible ? bundle?.error : null);
  const bytes = bundle?.missingDownloadBytes ?? bundle?.downloadBytes;
  const size = bytes
    ? formatFileSize(bytes)
    : (bundle?.estimatedSize ?? FEATURE_BUNDLES.ocr.estimatedSize);
  const qualityTranslations = t.toolSettings["remove-gif-background"];
  const fastUnsupportedMessage =
    language === "ar"
      ? t.toolSettings.ocr.fastArabicUnsupported
      : t.toolSettings.ocr.fastKoreanUnsupported;
  const qualityOptions: { value: OcrQuality; label: string }[] = [
    { value: "fast", label: qualityTranslations.qualityFast },
    { value: "balanced", label: qualityTranslations.qualityBalanced },
    { value: "best", label: qualityTranslations.qualityBest },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {qualityOptions.map((option) => {
          const fastUnsupported = accurateOnly && option.value === "fast";
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={quality === option.value}
              aria-describedby={fastUnsupported ? helpId : undefined}
              disabled={fastUnsupported}
              onClick={() => onChange(option.value)}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                quality === option.value
                  ? "border-primary bg-primary/10 text-primary-ink"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {accurateOnly && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {fastUnsupportedMessage}
        </p>
      )}

      {needsPack && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-start">
          <p className="text-xs text-muted-foreground">
            {incompatible
              ? (bundle?.error ??
                featureIncompatibleMessage(t, {
                  feature: bundle?.id ?? "ocr",
                  featureName: bundle?.name ?? t.tools.ocr.name,
                  compatibilityReason: bundle?.compatibilityReason ?? undefined,
                }))
              : format(t.features.requiresDownload, { size })}
          </p>
          {!incompatible && isAdmin && (
            <button
              type="button"
              onClick={() => installBundle("ocr")}
              disabled={!!installing || queued}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {installing || queued ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {installing || queued
                ? t.settings.aiFeatures.installing
                : format(t.features.enableButton, {
                    name: bundle ? bundleName(t, bundle) : t.tools.ocr.name,
                  })}
            </button>
          )}
          {!incompatible && !isAdmin && (
            <p className="mt-1 text-xs text-muted-foreground">{t.features.notEnabledDescription}</p>
          )}
          {displayedError && <p className="mt-1 text-xs text-destructive">{displayedError}</p>}
        </div>
      )}
    </div>
  );
}
