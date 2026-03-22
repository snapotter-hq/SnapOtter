import { Upload, Loader2 } from "lucide-react";

interface ProgressCardProps {
  active: boolean;
  phase: "uploading" | "processing" | "complete";
  label: string;
  stage?: string;
  percent: number;
  elapsed: number;
}

export function ProgressCard({
  active,
  phase,
  label,
  stage,
  percent,
  elapsed,
}: ProgressCardProps) {
  if (!active) return null;

  const icon =
    phase === "uploading" ? (
      <Upload className="h-4 w-4 text-primary" />
    ) : (
      <Loader2 className="h-4 w-4 text-primary animate-spin" />
    );

  const sublabel = [stage, `${elapsed}s`].filter(Boolean).join(" \u00b7 ");

  return (
    <div className="bg-muted/80 border border-border rounded-xl p-3 space-y-2.5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {label}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {sublabel}
          </div>
        </div>
        <span className="text-sm font-semibold text-primary font-mono tabular-nums">
          {Math.round(percent)}%
        </span>
      </div>
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
