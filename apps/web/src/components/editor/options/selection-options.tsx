import { Circle, Minus, PenTool, Plus, Square, Wand2 } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";
import type { SelectionMode, ToolType } from "@/types/editor";

type SelectionType = "rect" | "ellipse" | "lasso";

// ---------------------------------------------------------------------------
// SelectionOptions -- selection type toggle, mode buttons, feather input
// ---------------------------------------------------------------------------

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center justify-center rounded px-2",
        "text-xs transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function SelectionOptions() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const selectionMode = useEditorStore((s) => s.selectionMode);
  const setSelectionMode = useEditorStore((s) => s.setSelectionMode);
  const magicWandTolerance = useEditorStore((s) => s.magicWandTolerance);
  const setMagicWandTolerance = useEditorStore((s) => s.setMagicWandTolerance);
  const magicWandContiguous = useEditorStore((s) => s.magicWandContiguous);
  const setMagicWandContiguous = useEditorStore((s) => s.setMagicWandContiguous);
  const selectionFeather = useEditorStore((s) => s.selectionFeather);
  const setSelectionFeather = useEditorStore((s) => s.setSelectionFeather);

  const selectionType: SelectionType =
    activeTool === "marquee-ellipse"
      ? "ellipse"
      : activeTool === "lasso-free" || activeTool === "lasso-poly"
        ? "lasso"
        : "rect";

  const handleTypeChange = useCallback(
    (type: SelectionType) => {
      const toolMap: Record<SelectionType, ToolType> = {
        rect: "marquee-rect",
        ellipse: "marquee-ellipse",
        lasso: "lasso-free",
      };
      setTool(toolMap[type]);
    },
    [setTool],
  );

  const handleModeChange = useCallback(
    (mode: SelectionMode) => {
      setSelectionMode(mode);
    },
    [setSelectionMode],
  );

  const isMarquee = activeTool === "marquee-rect" || activeTool === "marquee-ellipse";
  const isLasso = activeTool === "lasso-free" || activeTool === "lasso-poly";
  const isMagicWand = activeTool === "magic-wand";

  return (
    <div className="flex items-center gap-3">
      {/* Selection type toggle */}
      {!isMagicWand && (
        <div className="flex items-center gap-1">
          <span className="me-1 text-xs text-muted-foreground">Type:</span>
          <ToggleButton
            active={selectionType === "rect" && isMarquee}
            onClick={() => handleTypeChange("rect")}
            label="Rectangular"
          >
            <Square className="me-1 h-3.5 w-3.5" />
            Rect
          </ToggleButton>
          <ToggleButton
            active={selectionType === "ellipse" && isMarquee}
            onClick={() => handleTypeChange("ellipse")}
            label="Elliptical"
          >
            <Circle className="me-1 h-3.5 w-3.5" />
            Ellipse
          </ToggleButton>
          <ToggleButton active={isLasso} onClick={() => handleTypeChange("lasso")} label="Lasso">
            <PenTool className="me-1 h-3.5 w-3.5" />
            Lasso
          </ToggleButton>
        </div>
      )}

      {isMagicWand && (
        <div className="flex items-center gap-1">
          <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Magic Wand</span>
        </div>
      )}

      <div className="h-4 w-px bg-border" />

      {/* Selection mode buttons */}
      <div className="flex items-center gap-1">
        <span className="me-1 text-xs text-muted-foreground">Mode:</span>
        <ToggleButton
          active={selectionMode === "new"}
          onClick={() => handleModeChange("new")}
          label="New Selection"
        >
          New
        </ToggleButton>
        <ToggleButton
          active={selectionMode === "add"}
          onClick={() => handleModeChange("add")}
          label="Add to Selection"
        >
          <Plus className="me-0.5 h-3 w-3" />
          Add
        </ToggleButton>
        <ToggleButton
          active={selectionMode === "subtract"}
          onClick={() => handleModeChange("subtract")}
          label="Subtract from Selection"
        >
          <Minus className="me-0.5 h-3 w-3" />
          Sub
        </ToggleButton>
      </div>

      {/* Lasso sub-type toggle */}
      {isLasso && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1">
            <ToggleButton
              active={activeTool === "lasso-free"}
              onClick={() => setTool("lasso-free")}
              label="Freehand Lasso"
            >
              Freehand
            </ToggleButton>
            <ToggleButton
              active={activeTool === "lasso-poly"}
              onClick={() => setTool("lasso-poly")}
              label="Polygonal Lasso"
            >
              Polygonal
            </ToggleButton>
          </div>
        </>
      )}

      {/* Feather radius */}
      {(isMarquee || isLasso) && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Feather:</span>
            <input
              type="number"
              min={0}
              max={100}
              value={selectionFeather}
              onChange={(e) => setSelectionFeather(Number(e.target.value))}
              className="w-14 px-1.5 py-0.5 text-xs rounded border border-border bg-background text-foreground tabular-nums"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </>
      )}

      {/* Magic Wand tolerance + contiguous */}
      {isMagicWand && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <label htmlFor="wand-tolerance" className="text-xs text-muted-foreground">
              Tolerance:
            </label>
            <input
              id="wand-tolerance"
              type="number"
              min={0}
              max={255}
              value={magicWandTolerance}
              onChange={(e) => setMagicWandTolerance(Number(e.target.value))}
              className={cn(
                "h-6 w-14 rounded border border-border bg-card px-1.5 text-xs text-foreground",
                "focus:border-ring focus:outline-none",
              )}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={magicWandContiguous}
              onChange={(e) => setMagicWandContiguous(e.target.checked)}
              className="rounded border-border"
            />
            Contiguous
          </label>
        </>
      )}
    </div>
  );
}
