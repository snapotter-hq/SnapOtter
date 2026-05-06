import type { FeatureBundleState } from "@snapotter/shared";
import { AlertCircle, Clock, Download, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
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
  "Your images will thank you later...",
  "Loading... but make it fancy...",
  "This would be a great time for coffee...",
  "Rome wasn't built in a day either...",
  "Shhh... genius at work...",
  "Making your photos jealous of what's coming...",
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
  toolName?: string;
}

export function FeatureInstallPrompt({ bundle, isAdmin, toolName }: FeatureInstallPromptProps) {
  const { installBundle, clearError, installing, errors, startTimes, queued } = useFeaturesStore();
  const progress = installing[bundle.id] ?? null;
  const error = errors[bundle.id] ?? null;
  const isInstalling = !!progress;
  const isQueued = queued.includes(bundle.id);
  const startTime = startTimes[bundle.id] ?? null;
  const displayName = toolName || bundle.name;

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
    installBundle(bundle.id);
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
        <Download className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">Feature Not Enabled</h2>
        <p className="text-muted-foreground max-w-md">
          This feature is not enabled. Ask your administrator to enable it in Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-4">
      <Download className="h-16 w-16 text-muted-foreground" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{displayName}</h2>
        <p className="text-muted-foreground max-w-md">{bundle.description}</p>
        <p className="text-sm text-muted-foreground">
          This feature requires an additional download (~{bundle.estimatedSize})
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg px-4 py-3 max-w-md w-full">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm flex-1 text-left">{error}</span>
          <button
            type="button"
            onClick={handleInstall}
            className="flex items-center gap-1 text-sm font-medium hover:opacity-80"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
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
            {eta && <p className="text-xs text-muted-foreground shrink-0 ml-2">{eta}</p>}
          </div>
        </div>
      )}

      {isQueued && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="h-5 w-5" />
          <span className="text-sm font-medium">Queued for installation...</span>
        </div>
      )}

      {!isInstalling && !error && !isQueued && (
        <button
          type="button"
          onClick={handleInstall}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium"
        >
          Enable {displayName}
        </button>
      )}
    </div>
  );
}
