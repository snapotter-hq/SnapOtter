import { Download, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useFeaturesStore } from "@/stores/features-store";

export function AiInstallIndicator() {
  const { bundles, installing, queued, fetch } = useFeaturesStore();

  useEffect(() => {
    fetch();
  }, [fetch]);

  const activeIds = Object.keys(installing);
  const totalPending = activeIds.length + queued.length;

  if (totalPending === 0) return null;

  const activeBundle = bundles.find((b) => installing[b.id]);
  const progress = activeBundle ? installing[activeBundle.id] : null;
  const completedCount = bundles.filter((b) => b.status === "installed").length;
  const totalBundles = bundles.length;

  return (
    <IndicatorContent
      name={activeBundle?.name ?? "AI Feature"}
      percent={progress?.percent ?? 0}
      completedCount={completedCount}
      totalBundles={totalBundles}
      queuedCount={queued.length}
    />
  );
}

function IndicatorContent({
  name,
  percent,
  completedCount,
  totalBundles,
  queuedCount,
}: {
  name: string;
  percent: number;
  completedCount: number;
  totalBundles: number;
  queuedCount: number;
}) {
  return (
    <div className="fixed bottom-16 right-4 z-40 bg-background border border-border rounded-xl shadow-lg px-4 py-3 min-w-[260px] max-w-[320px]">
      <div className="flex items-center gap-2 mb-2">
        <Download className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm font-medium text-foreground truncate">Installing {name}</p>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{percent}%</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{totalBundles} installed
          {queuedCount > 0 && ` · ${queuedCount} queued`}
        </span>
      </div>
    </div>
  );
}
