import {
  ANALYTICS_EVENTS,
  FEATURE_BUNDLES,
  type FeatureBundleState,
  getRequiredBundlesForTool,
} from "@snapotter/shared";
import { AlertCircle, Clock, Download, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { format, formatFileSize } from "@/lib/format";
import { useFeaturesStore } from "@/stores/features-store";

const PROGRESS_MESSAGES = [
  "Almost there... probably...",
  "Good things take time...",
  "Still faster than watching paint dry...",
  "Your patience is truly inspiring...",
  "Working harder than it looks...",
  "This is the exciting part, trust me...",
  "Doing important behind-the-scenes stuff...",
  "If you're reading this, it's working...",
  "Preparing something awesome...",
  "Worth every second, pinky promise...",
  "The suspense is part of the experience...",
  "Teaching your computer new tricks...",
  "Setting up your superpowers...",
  "Your files will thank you later...",
  "Loading... but make it fancy...",
  "This would be a great time for coffee...",
  "Rome wasn't built in a day either...",
  "Shhh... genius at work...",
  "Making your projects jealous of what's coming...",
  "Assembling the dream team...",
  "Unpacking awesomeness...",
  "Almost done thinking about starting... just kidding...",
  "Plot twist: this is actually doing something...",
  "Warming up the creative engines...",
  "Imagination loading...",
  "Not a screensaver, we promise...",
  "Great art takes time to install...",
  "Your future self will thank you...",
  "Grabbing some really smart files...",
  "Hang tight, the best is yet to come...",
];

function formatTimeRemaining(ms: number): string {
  if (ms < 60000) return "Less than a minute left";
  const mins = Math.ceil(ms / 60000);
  if (mins === 1) return "~1 minute left";
  return `~${mins} minutes left`;
}

interface FeatureInstallPromptProps {
  bundle: FeatureBundleState;
  isAdmin: boolean;
  toolId?: string;
  toolName?: string;
  toolDescription?: string;
}

function fallbackBundleState(bundleId: string): FeatureBundleState | null {
  const info = FEATURE_BUNDLES[bundleId];
  if (!info) return null;
  return {
    id: info.id,
    name: info.name,
    description: info.description,
    status: "not_installed",
    installedVersion: null,
    estimatedSize: info.estimatedSize,
    enablesTools: info.enablesTools,
    progress: null,
    error: null,
  };
}

export function FeatureInstallPrompt({
  bundle,
  isAdmin,
  toolId,
  toolName,
  toolDescription,
}: FeatureInstallPromptProps) {
  const { t } = useTranslation();
  const {
    bundles,
    installBundle,
    installTool,
    clearError,
    installing,
    errors,
    startTimes,
    queued,
  } = useFeaturesStore();
  const progress = installing[bundle.id] ?? null;
  const error = errors[bundle.id] ?? null;
  const isInstalling = !!progress;
  const isQueued = queued.includes(bundle.id);
  const startTime = startTimes[bundle.id] ?? null;
  const displayName = toolName || bundle.name;
  const displayDescription = toolDescription || bundle.description;
  const isRepair = bundle.status === "error";
  const requiredBundleIds = toolId ? getRequiredBundlesForTool(toolId) : [bundle.id];
  const requiredBundles = requiredBundleIds
    .map(
      (bundleId) =>
        bundles.find((candidate) => candidate.id === bundleId) ??
        (bundle.id === bundleId ? bundle : fallbackBundleState(bundleId)),
    )
    .filter((candidate): candidate is FeatureBundleState => candidate !== null);
  const bundlesNeedingDownload = requiredBundles.filter(
    (candidate) => candidate.status !== "installed",
  );
  const downloadSizeLabel =
    bundlesNeedingDownload
      .map((candidate) =>
        candidate.downloadBytes ? formatFileSize(candidate.downloadBytes) : candidate.estimatedSize,
      )
      .join(" + ") ||
    (bundle.downloadBytes ? formatFileSize(bundle.downloadBytes) : bundle.estimatedSize);
  // Show the per-bundle breakdown for any multi-bundle tool, including the
  // repair state: when one bundle of a multi-bundle tool (e.g. passport-photo)
  // errors, the user still needs to see that the sibling bundle is installing,
  // queued, or already done. Hiding it during repair is exactly when it hurts.
  const showBundleBreakdown = toolId !== undefined && requiredBundles.length > 1;

  function bundleStatusLabel(candidate: FeatureBundleState): string {
    if (installing[candidate.id]) return t.settings.aiFeatures.installing;
    if (queued.includes(candidate.id)) return t.settings.aiFeatures.queued;
    if (candidate.status === "installed") return t.settings.aiFeatures.installed;
    if (candidate.status === "error") return t.settings.aiFeatures.repair;
    return t.settings.aiFeatures.notInstalled;
  }

  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * PROGRESS_MESSAGES.length),
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isInstalling) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROGRESS_MESSAGES.length);
      setNow(Date.now());
    }, 3000);
    return () => clearInterval(interval);
  }, [isInstalling]);

  useEffect(() => {
    if (!isAdmin || bundle.status === "installed") return;
    // Install-prompt impression: the top of the AI-adoption funnel
    // (prompted -> ai_bundle_action install -> tool_used is_ai_tool). Non-admins
    // see a different "not enabled" message, not this prompt.
    import("@/lib/analytics").then(({ track }) => {
      track(ANALYTICS_EVENTS.AI_BUNDLE_PROMPTED, { bundle_id: bundle.id });
    });
  }, [bundle.id, bundle.status, isAdmin]);

  const eta = (() => {
    if (!progress || !startTime || progress.percent <= 2) return null;
    const elapsed = now - startTime;
    const rate = progress.percent / elapsed;
    if (rate <= 0) return null;
    const remaining = (100 - progress.percent) / rate;
    return formatTimeRemaining(remaining);
  })();

  function handleInstall() {
    clearError(bundle.id);
    if (toolId) {
      installTool(toolId);
    } else {
      installBundle(bundle.id);
    }
  }

  // Defensive guard: if the bundle is already installed (status may have
  // been refreshed after mount), never render the install prompt.
  if (bundle.status === "installed") {
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <Download className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">{t.features.notEnabledTitle}</h2>
        <p className="text-muted-foreground max-w-md">{t.features.notEnabledDescription}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
      <Download className="h-16 w-16 text-muted-foreground" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">
          {isRepair ? t.features.repairRequired : displayName}
        </h2>
        <p className="text-muted-foreground max-w-md">
          {isRepair ? t.features.repairDescription : displayDescription}
        </p>
        {!isRepair && (
          <p className="text-sm text-muted-foreground">
            {format(t.features.requiresDownload, {
              size: downloadSizeLabel,
            })}
          </p>
        )}
      </div>

      {showBundleBreakdown && (
        <div className="w-full max-w-md rounded-lg border border-border bg-background text-start overflow-hidden">
          {requiredBundles.map((candidate) => {
            const isCandidateInstalling = !!installing[candidate.id];
            const isCandidateQueued = queued.includes(candidate.id);
            const isCandidateInstalled = candidate.status === "installed";
            const statusClass = isCandidateInstalled
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : isCandidateInstalling || isCandidateQueued
                ? "bg-primary/10 text-primary"
                : candidate.status === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground";
            return (
              <div
                key={candidate.id}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{candidate.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {candidate.downloadBytes
                      ? formatFileSize(candidate.downloadBytes)
                      : candidate.estimatedSize}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}
                >
                  {bundleStatusLabel(candidate)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {(error || (isRepair && bundle.error)) && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg px-4 py-3 max-w-md w-full">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1 text-start">{error || bundle.error}</span>
          {error && (
            <button
              type="button"
              onClick={handleInstall}
              className="flex items-center gap-1 text-sm font-medium hover:opacity-80"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.features.retryButton}
            </button>
          )}
        </div>
      )}

      {isInstalling && progress && (
        <div className="w-full max-w-md space-y-2">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="italic truncate">{PROGRESS_MESSAGES[messageIndex]}</span>
            </div>
            {eta && <p className="text-xs text-muted-foreground shrink-0 ms-2">{eta}</p>}
          </div>
        </div>
      )}

      {isQueued && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5" />
          <span className="text-sm font-medium">{t.features.queued}</span>
        </div>
      )}

      {!isInstalling && !error && !isQueued && (
        <button
          type="button"
          onClick={handleInstall}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium"
        >
          {isRepair
            ? format(t.features.repairButton, { name: displayName })
            : format(t.features.enableButton, { name: displayName })}
        </button>
      )}
    </div>
  );
}
