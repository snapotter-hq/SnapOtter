// apps/web/src/components/editor/editor-toolbar.tsx
//
// Toolbar layout, icons, and shortcuts follow the standard Photoshop
// convention so users coming from other editors feel at home.
import {
  Blend,
  BoxSelect,
  Crop,
  Droplet,
  Droplets,
  Eraser,
  Fingerprint,
  Flame,
  Hand,
  Hexagon,
  Lasso,
  Maximize2,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pencil,
  Pipette,
  Stamp,
  Sun,
  Triangle,
  Type,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { hotkeysModIsMeta } from "@/lib/platform";
import { useEditorStore } from "@/stores/editor-store";
import type { ToolType } from "@/types/editor";
import { IconButton } from "./common/icon-button";

type ToolbarTool = Extract<
  ToolType,
  | "move"
  | "transform"
  | "marquee-rect"
  | "lasso-free"
  | "magic-wand"
  | "crop"
  | "eyedropper"
  | "brush"
  | "pencil"
  | "clone-stamp"
  | "eraser"
  | "fill"
  | "gradient"
  | "blur-brush"
  | "sharpen-brush"
  | "smudge"
  | "dodge"
  | "burn"
  | "sponge"
  | "shape-rect"
  | "text"
  | "hand"
  | "zoom"
>;

interface ToolGroup {
  tools: {
    tool: ToolbarTool;
    icon: typeof MousePointer2;
    shortcut: string;
  }[];
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    tools: [
      { tool: "move", icon: MousePointer2, shortcut: "V" },
      { tool: "transform", icon: Maximize2, shortcut: "mod+t" },
    ],
  },
  {
    tools: [
      { tool: "marquee-rect", icon: BoxSelect, shortcut: "M" },
      { tool: "lasso-free", icon: Lasso, shortcut: "L" },
      { tool: "magic-wand", icon: Wand2, shortcut: "W" },
    ],
  },
  {
    tools: [
      { tool: "crop", icon: Crop, shortcut: "C" },
      { tool: "eyedropper", icon: Pipette, shortcut: "I" },
    ],
  },
  {
    tools: [
      { tool: "brush", icon: Paintbrush, shortcut: "B" },
      { tool: "pencil", icon: Pencil, shortcut: "N" },
    ],
  },
  {
    tools: [{ tool: "clone-stamp", icon: Stamp, shortcut: "S" }],
  },
  {
    tools: [{ tool: "eraser", icon: Eraser, shortcut: "E" }],
  },
  {
    tools: [
      { tool: "fill", icon: PaintBucket, shortcut: "G" },
      { tool: "gradient", icon: Blend, shortcut: "Shift+G" },
    ],
  },
  {
    tools: [
      { tool: "blur-brush", icon: Droplet, shortcut: "" },
      { tool: "sharpen-brush", icon: Triangle, shortcut: "" },
      { tool: "smudge", icon: Fingerprint, shortcut: "" },
    ],
  },
  {
    tools: [
      { tool: "dodge", icon: Sun, shortcut: "O" },
      { tool: "burn", icon: Flame, shortcut: "Shift+O" },
      { tool: "sponge", icon: Droplets, shortcut: "Shift+O" },
    ],
  },
  {
    tools: [{ tool: "shape-rect", icon: Hexagon, shortcut: "U" }],
  },
  {
    tools: [{ tool: "text", icon: Type, shortcut: "T" }],
  },
  {
    tools: [
      { tool: "hand", icon: Hand, shortcut: "H" },
      { tool: "zoom", icon: ZoomIn, shortcut: "Z" },
    ],
  },
];

export function EditorToolbar() {
  const { t } = useTranslation();
  const activeTool = useEditorStore((s) => s.activeTool);
  const setTool = useEditorStore((s) => s.setTool);
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);
  // Shortcuts are react-hotkeys-hook bindings, so `mod` follows its rule.
  const modIsMeta = hotkeysModIsMeta();

  const toolLabels: Record<ToolbarTool, string> = {
    move: t.editor.toolbar.move,
    transform: t.editor.menu.edit.freeTransform,
    "marquee-rect": t.editor.toolbar.marquee,
    "lasso-free": t.editor.options.selection.lasso,
    "magic-wand": t.editor.options.selection.magicWand,
    crop: t.editor.toolbar.crop,
    eyedropper: t.editor.toolbar.eyedropper,
    brush: t.editor.toolbar.brush,
    pencil: t.editor.toolbar.pencil,
    "clone-stamp": t.editor.toolbar.cloneStamp,
    eraser: t.editor.toolbar.eraser,
    fill: t.editor.toolbar.paintBucket,
    gradient: t.editor.toolbar.gradient,
    "blur-brush": t.editor.options.pixelBrush.blur,
    "sharpen-brush": t.editor.options.pixelBrush.sharpen,
    smudge: t.editor.options.pixelBrush.smudge,
    dodge: t.editor.options.dodgeBurn.dodge,
    burn: t.editor.options.dodgeBurn.burn,
    sponge: t.editor.options.dodgeBurn.sponge,
    "shape-rect": t.editor.shapes.shape,
    text: t.editor.toolbar.text,
    hand: t.editor.toolbar.hand,
    zoom: t.editor.toolbar.zoom,
  };

  return (
    <div className="flex flex-col items-center w-9 bg-card border-r border-border py-1.5 gap-0 overflow-y-auto">
      {TOOL_GROUPS.map((group, gi) => (
        <div key={group.tools[0].tool}>
          {gi > 0 && <div className="w-4 h-px bg-border/50 mx-auto my-0.5" />}
          {group.tools.map((entry) => (
            <IconButton
              key={entry.tool}
              icon={entry.icon}
              label={toolLabels[entry.tool]}
              shortcut={formatShortcut(entry.shortcut, modIsMeta)}
              active={activeTool === entry.tool}
              disabled={!sourceImageUrl && entry.tool !== "hand" && entry.tool !== "zoom"}
              onClick={() => setTool(entry.tool)}
              data-testid={`tool-${entry.tool}`}
              data-tool={entry.tool}
              data-tool-active={String(activeTool === entry.tool)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
