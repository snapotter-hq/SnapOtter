import type { FeatureBundleState } from "@snapotter/shared";
import { Clock, Download, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import { useFeaturesStore } from "@/stores/features-store";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatTimeRemaining(ms: number): string {
  if (ms < 60000) return "Less than a minute left";
  const mins = Math.ceil(ms / 60000);
  if (mins === 1) return "~1 minute left";
  return `~${mins} minutes left`;
}

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

export function AiFeaturesSection() {
  const {
    bundles,
    fetch,
    installing,
    errors,
    queued,
    installAllActive,
    startTimes,
    installBundle,
    uninstallBundle,
    reinstallBundle,
    installAll,
  } = useFeaturesStore();
  const [diskUsage, setDiskUsage] = useState<number | null>(null);

  const loadDiskUsage = useCallback(async () => {
    try {
      const data = await apiGet<{ totalBytes: number }>("/v1/admin/features/disk-usage");
      setDiskUsage(data.totalBytes);
    } catch {}
  }, []);

  useEffect(() => {
    fetch();
    loadDiskUsage();
  }, [fetch, loadDiskUsage]);

  const prevInstallingKeys = useRef(new Set(Object.keys(installing)));
  useEffect(() => {
    const currentKeys = new Set(Object.keys(installing));
    for (const key of prevInstallingKeys.current) {
      if (!currentKeys.has(key)) {
        loadDiskUsage();
        break;
      }
    }
    prevInstallingKeys.current = currentKeys;
  }, [installing, loadDiskUsage]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">AI Features</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Manage AI model bundles for advanced image processing.
          </p>
        </div>
        <button
          type="button"
          onClick={installAll}
          disabled={installAllActive || bundles.every((b) => b.status === "installed")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Install All
        </button>
      </div>

      <div className="space-y-3">
        {bundles.map((bundle) => (
          <BundleCard
            key={bundle.id}
            bundle={bundle}
            progress={installing[bundle.id] ?? null}
            error={errors[bundle.id] ?? null}
            onInstall={() => installBundle(bundle.id)}
            onUninstall={() => uninstallBundle(bundle.id)}
            onReinstall={() => reinstallBundle(bundle.id)}
            isInstalling={!!installing[bundle.id]}
            isQueued={queued.includes(bundle.id)}
            startTime={startTimes[bundle.id] ?? null}
          />
        ))}
      </div>

      {diskUsage !== null && (
        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
          Disk usage: {formatBytes(diskUsage)}
        </p>
      )}
    </div>
  );
}

interface BundleProgress {
  percent: number;
  stage: string;
}

function BundleCard({
  bundle,
  progress,
  error,
  onInstall,
  onUninstall,
  onReinstall,
  isInstalling,
  isQueued,
  startTime,
}: {
  bundle: FeatureBundleState;
  progress: BundleProgress | null;
  error: string | null;
  onInstall: () => void;
  onUninstall: () => void;
  onReinstall: () => void;
  isInstalling: boolean;
  isQueued: boolean;
  startTime: number | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * PROGRESS_MESSAGES.length),
  );
  const [now, setNow] = useState(Date.now());
  const status = isQueued ? "queued" : isInstalling ? "installing" : bundle.status;

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

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{bundle.name}</p>
          <p className="text-xs text-muted-foreground">
            {bundle.description} (~{bundle.estimatedSize})
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="flex items-center gap-1.5">
            {status === "installed" && (
              <>
                <span className="bg-green-500 rounded-full h-2 w-2" />
                <span className="text-xs text-muted-foreground">Installed</span>
              </>
            )}
            {status === "not_installed" && !error && (
              <>
                <span className="bg-muted-foreground rounded-full h-2 w-2" />
                <span className="text-xs text-muted-foreground">Not installed</span>
              </>
            )}
            {status === "queued" && (
              <>
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Queued</span>
              </>
            )}
            {status === "installing" && progress && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{progress.percent}%</span>
              </>
            )}
            {(status === "error" || error) && (
              <>
                <span className="bg-destructive rounded-full h-2 w-2" />
                <span className="text-xs text-destructive truncate max-w-[120px]">
                  {error ?? bundle.error}
                </span>
              </>
            )}
          </div>

          {status === "not_installed" && !error && (
            <button
              type="button"
              onClick={onInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Install
            </button>
          )}
          {status === "installed" && !confirming && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReinstall}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Repair
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Uninstall
              </button>
            </div>
          )}
          {status === "installed" && confirming && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  onUninstall();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          {status === "installing" && (
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium opacity-50"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Installing...
            </button>
          )}
          {(status === "error" || error) && !isInstalling && !isQueued && (
            <button
              type="button"
              onClick={onInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
      {status === "installing" && progress && (
        <div className="mt-3 space-y-1.5">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground italic">
              {PROGRESS_MESSAGES[messageIndex]}
            </p>
            {eta && <p className="text-xs text-muted-foreground shrink-0 ml-2">{eta}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
