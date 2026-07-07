import type { FeatureBundleState } from "@snapotter/shared";
import {
  AlertTriangle,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { apiGet, formatHeaders } from "@/lib/api";
import { format, formatFileSize } from "@/lib/format";
import { useFeaturesStore } from "@/stores/features-store";

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

export function AiFeaturesSection() {
  const { t } = useTranslation();
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
    resetEnvironment,
    resetError,
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
          <h3 className="text-lg font-semibold text-foreground">{t.settings.aiFeatures.title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t.settings.aiFeatures.description}</p>
        </div>
        <button
          type="button"
          onClick={installAll}
          disabled={installAllActive || bundles.every((b) => b.status === "installed")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {t.settings.aiFeatures.installAll}
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
          {format(t.settings.aiFeatures.diskUsage, { size: formatFileSize(diskUsage) })}
        </p>
      )}

      <ImportBundleSection
        onImported={() => {
          fetch();
          loadDiskUsage();
        }}
      />

      <ResetEnvironmentSection
        onReset={resetEnvironment}
        error={resetError}
        onResetDone={loadDiskUsage}
      />
    </div>
  );
}

function ResetEnvironmentSection({
  onReset,
  error,
  onResetDone,
}: {
  onReset: () => Promise<void>;
  error: string | null;
  onResetDone: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setConfirming(false);
    setResetting(true);
    try {
      await onReset();
      onResetDone();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="pt-4 border-t border-border space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-foreground">
            {t.settings.aiFeatures.resetTitle}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t.settings.aiFeatures.resetDescription}
          </p>
        </div>
      </div>

      {!confirming && (
        <button
          type="button"
          disabled={resetting}
          onClick={() => setConfirming(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
        >
          {resetting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          {t.settings.aiFeatures.resetButton}
        </button>
      )}

      {confirming && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{t.settings.aiFeatures.resetConfirmMessage}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t.common.confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">
          {format(t.settings.aiFeatures.resetFailed, { error })}
        </p>
      )}
    </div>
  );
}

function ImportBundleSection({ onImported }: { onImported: () => void }) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async (file: File) => {
    setImporting(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/v1/admin/features/import", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `Import failed: ${res.status}`);
      }

      setFeedback({ type: "success", message: t.settings.aiFeatures.importSuccess });
      onImported();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setFeedback({
        type: "error",
        message: format(t.settings.aiFeatures.importError, { error: msg }),
      });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="pt-4 border-t border-border space-y-2">
      <div>
        <h4 className="text-sm font-medium text-foreground">
          {t.settings.aiFeatures.importBundle}
        </h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t.settings.aiFeatures.importDescription}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".tar.gz,.tgz"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImport(file);
          }}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {importing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {importing ? t.settings.aiFeatures.importing : t.settings.aiFeatures.importButton}
        </button>
      </div>
      {feedback && (
        <p
          className={`text-xs ${feedback.type === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
        >
          {feedback.message}
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
  const { t } = useTranslation();
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
            {bundle.description} (~
            {bundle.downloadBytes ? formatFileSize(bundle.downloadBytes) : bundle.estimatedSize}
            {bundle.installedBytes
              ? `, ${format(t.settings.aiFeatures.sizeOnDisk, {
                  size: formatFileSize(bundle.installedBytes),
                })}`
              : ""}
            )
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 ms-4">
          <div className="flex items-center gap-1.5">
            {status === "installed" && (
              <>
                <span className="bg-green-500 rounded-full h-2 w-2" />
                <span className="text-xs text-muted-foreground">
                  {t.settings.aiFeatures.installed}
                </span>
              </>
            )}
            {status === "not_installed" && !error && (
              <>
                <span className="bg-muted-foreground rounded-full h-2 w-2" />
                <span className="text-xs text-muted-foreground">
                  {t.settings.aiFeatures.notInstalled}
                </span>
              </>
            )}
            {status === "queued" && (
              <>
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {t.settings.aiFeatures.queued}
                </span>
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
              {t.settings.aiFeatures.install}
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
                {t.settings.aiFeatures.repair}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.settings.aiFeatures.uninstall}
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
                {t.common.confirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                {t.common.cancel}
              </button>
            </div>
          )}
          {status === "installing" && (
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium opacity-50"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t.settings.aiFeatures.installing}
            </button>
          )}
          {(status === "error" || error) && !isInstalling && !isQueued && (
            <button
              type="button"
              onClick={onInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.common.retry}
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
            {eta && <p className="text-xs text-muted-foreground shrink-0 ms-2">{eta}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
