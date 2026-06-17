// apps/web/src/components/editor/editor-options-bar.tsx

import { useState } from "react";
import { useEditorStore } from "@/stores/editor-store";
import type { ToolType } from "@/types/editor";
import { BrushOptions } from "./options/brush-options";
import { CloneStampOptions } from "./options/clone-stamp-options";
import { CropOptions } from "./options/crop-options";
import { DodgeBurnOptions } from "./options/dodge-burn-options";
import { EyedropperOptions, type SampleSize } from "./options/eyedropper-options";
import { FillOptions } from "./options/fill-options";
import { GradientOptions } from "./options/gradient-options";
import { MoveOptions } from "./options/move-options";
import { PixelBrushOptions } from "./options/pixel-brush-options";
import { SelectionOptions } from "./options/selection-options";
import { ShapeOptions } from "./options/shape-options";
import { TextOptions } from "./options/text-options";
import { TransformOptions } from "./options/transform-options";
import { useTransformTool } from "./tools/transform-tool";

function getOptionsComponent(tool: ToolType): React.ComponentType | null {
  switch (tool) {
    case "move":
      return MoveOptions;
    case "marquee-rect":
    case "marquee-ellipse":
    case "lasso-free":
    case "lasso-poly":
    case "magic-wand":
      return SelectionOptions;
    case "crop":
      return CropOptions;
    case "brush":
    case "eraser":
    case "pencil":
      return BrushOptions;
    case "clone-stamp":
      return CloneStampOptions;
    case "dodge":
    case "burn":
    case "sponge":
      return DodgeBurnOptions;
    case "blur-brush":
    case "sharpen-brush":
    case "smudge":
      return PixelBrushOptions;
    case "fill":
      return FillOptions;
    case "gradient":
      return GradientOptions;
    case "shape-rect":
    case "shape-ellipse":
    case "shape-line":
    case "shape-arrow":
    case "shape-polygon":
    case "shape-star":
      return ShapeOptions;
    case "text":
      return TextOptions;
    // transform and eyedropper are handled separately in EditorOptionsBar
    case "transform":
    case "eyedropper":
    case "hand":
    case "zoom":
      return null;
    default:
      return null;
  }
}

export function EditorOptionsBar() {
  const activeTool = useEditorStore((s) => s.activeTool);

  const OptionsComponent = getOptionsComponent(activeTool);

  // Eyedropper state (managed here since EyedropperOptions requires props)
  const [eyedropperSampleSize, setEyedropperSampleSize] = useState<SampleSize>(1);

  // Transform tool API (managed here since TransformOptions requires props)
  const transformApi = useTransformTool();

  // Pick sampled color from store foreground when eyedropper is active
  const foregroundColor = useEditorStore((s) => s.foregroundColor);

  return (
    <div
      className="flex items-center h-9 px-3 bg-card border-b border-border gap-3 shrink-0 overflow-hidden"
      data-testid="editor-options-bar"
    >
      <span className="text-xs font-medium text-muted-foreground shrink-0">
        {activeTool
          .replace(/-/g, " ")
          .replace(/^shape /, "")
          .replace(/\b\w/g, (c) => c.toUpperCase())}
      </span>
      <div className="h-4 w-px bg-border shrink-0" />
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
        {OptionsComponent && <OptionsComponent />}
        {activeTool === "eyedropper" && (
          <EyedropperOptions
            sampleSize={eyedropperSampleSize}
            onSampleSizeChange={setEyedropperSampleSize}
            sampledColor={foregroundColor}
          />
        )}
        {activeTool === "transform" && <TransformOptions api={transformApi} />}
      </div>
    </div>
  );
}
