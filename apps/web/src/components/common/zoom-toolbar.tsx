import { Hand, Maximize, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "@/contexts/i18n-context";

interface ZoomToolbarProps {
  percent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  canActualSize: boolean;
  handToolActive: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onActualSize: () => void;
  onToggleHandTool: () => void;
}

const btn =
  "p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed";

export function ZoomToolbar({
  percent,
  canZoomIn,
  canZoomOut,
  canActualSize,
  handToolActive,
  onZoomIn,
  onZoomOut,
  onFit,
  onActualSize,
  onToggleHandTool,
}: ZoomToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-10">
      <div
        data-testid="zoom-toolbar"
        className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-background/90 px-2 py-1 shadow-sm backdrop-blur-sm"
      >
        <button
          type="button"
          data-testid="zoom-out"
          onClick={onZoomOut}
          disabled={!canZoomOut}
          title={t.a11y.zoomOut}
          aria-label={t.a11y.zoomOut}
          className={btn}
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span
          data-testid="zoom-percent"
          className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted-foreground"
        >
          {percent}%
        </span>
        <button
          type="button"
          data-testid="zoom-in"
          onClick={onZoomIn}
          disabled={!canZoomIn}
          title={t.a11y.zoomIn}
          aria-label={t.a11y.zoomIn}
          className={btn}
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          data-testid="zoom-fit"
          onClick={onFit}
          title={t.a11y.fitToView}
          aria-label={t.a11y.fitToView}
          className={btn}
        >
          <Maximize className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-testid="zoom-actual"
          onClick={onActualSize}
          disabled={!canActualSize}
          title={t.a11y.actualSize}
          aria-label={t.a11y.actualSize}
          className={btn}
        >
          <Minimize2 className="h-4 w-4" />
        </button>
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          data-testid="zoom-pan"
          onClick={onToggleHandTool}
          title={t.a11y.pan}
          aria-label={t.a11y.pan}
          aria-pressed={handToolActive}
          className={`${btn} ${handToolActive ? "bg-primary/10 text-primary-ink hover:text-primary-ink" : ""}`}
        >
          <Hand className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
