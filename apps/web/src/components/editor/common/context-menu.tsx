import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  CopyPlus,
  ImageIcon,
  Maximize,
  MousePointer,
  Scissors,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { hotkeysModIsMeta } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

// ---------------------------------------------------------------------------
// Context menu state
// ---------------------------------------------------------------------------

interface MenuPosition {
  x: number;
  y: number;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  dividerAfter?: boolean;
}

// ---------------------------------------------------------------------------
// Hook: useContextMenu
// ---------------------------------------------------------------------------

export function useContextMenu() {
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [menuType, setMenuType] = useState<"object" | "canvas">("canvas");

  const handleContextMenu = useCallback((e: React.MouseEvent, hasSelectedObject: boolean) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setMenuType(hasSelectedObject ? "object" : "canvas");
  }, []);

  const close = useCallback(() => {
    setPosition(null);
  }, []);

  return { position, menuType, handleContextMenu, close };
}

// ---------------------------------------------------------------------------
// ContextMenu component
// ---------------------------------------------------------------------------

export function ContextMenu({
  position,
  menuType,
  onClose,
  onCanvasResize,
  onImageResize,
}: {
  position: MenuPosition;
  menuType: "object" | "canvas";
  onClose: () => void;
  onCanvasResize?: () => void;
  onImageResize?: () => void;
}) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedObjectIds = useEditorStore((s) => s.selectedObjectIds);
  const copyObjects = useEditorStore((s) => s.copyObjects);
  const cutObjects = useEditorStore((s) => s.cutObjects);
  const pasteObjects = useEditorStore((s) => s.pasteObjects);
  const removeObjects = useEditorStore((s) => s.removeObjects);
  const copyObjectsFn = useEditorStore((s) => s.copyObjects);
  const pasteObjectsFn = useEditorStore((s) => s.pasteObjects);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const clipboard = useEditorStore((s) => s.clipboard);
  const setSelection = useEditorStore((s) => s.setSelection);
  const canvasSize = useEditorStore((s) => s.canvasSize);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // These name the editor's react-hotkeys-hook bindings (use-editor-shortcuts),
  // so the modifier follows that library's rule. Duplicate has no binding of
  // its own (mod+d is Deselect), so it shows no hint.
  const modIsMeta = hotkeysModIsMeta();
  const hint = (keys: string) => formatShortcut(keys, modIsMeta);

  const objectItems: MenuItem[] = [
    {
      id: "cut",
      label: t.editor.menu.edit.cut,
      icon: Scissors,
      shortcut: hint("mod+x"),
      action: () => {
        cutObjects();
        onClose();
      },
    },
    {
      id: "copy",
      label: t.editor.menu.edit.copy,
      icon: Copy,
      shortcut: hint("mod+c"),
      action: () => {
        copyObjects();
        onClose();
      },
    },
    {
      id: "paste",
      label: t.editor.menu.edit.paste,
      icon: ClipboardPaste,
      shortcut: hint("mod+v"),
      action: () => {
        pasteObjects();
        onClose();
      },
      disabled: !clipboard || clipboard.length === 0,
    },
    {
      id: "duplicate",
      label: t.editor.ui.contextMenu.duplicate,
      icon: CopyPlus,
      action: () => {
        copyObjectsFn();
        pasteObjectsFn();
        onClose();
      },
      dividerAfter: true,
    },
    {
      id: "bringToFront",
      label: t.editor.menu.layer.arrange.bringToFront,
      icon: ArrowUp,
      action: () => {
        for (const id of selectedObjectIds) bringToFront(id);
        onClose();
      },
    },
    {
      id: "bringForward",
      label: t.editor.menu.layer.arrange.bringForward,
      icon: ArrowUp,
      action: () => {
        for (const id of selectedObjectIds) bringForward(id);
        onClose();
      },
    },
    {
      id: "sendBackward",
      label: t.editor.menu.layer.arrange.sendBackward,
      icon: ArrowDown,
      action: () => {
        for (const id of selectedObjectIds) sendBackward(id);
        onClose();
      },
    },
    {
      id: "sendToBack",
      label: t.editor.menu.layer.arrange.sendToBack,
      icon: ArrowDown,
      action: () => {
        for (const id of selectedObjectIds) sendToBack(id);
        onClose();
      },
      dividerAfter: true,
    },
    {
      id: "delete",
      label: t.editor.menu.edit.delete,
      icon: Trash2,
      shortcut: "Del",
      action: () => {
        removeObjects(selectedObjectIds);
        onClose();
      },
    },
  ];

  const canvasItems: MenuItem[] = [
    {
      id: "paste",
      label: t.editor.menu.edit.paste,
      icon: ClipboardPaste,
      shortcut: hint("mod+v"),
      action: () => {
        pasteObjects();
        onClose();
      },
      disabled: !clipboard || clipboard.length === 0,
    },
    {
      id: "selectAll",
      label: t.editor.ui.contextMenu.selectAll,
      icon: MousePointer,
      // No hint: mod+a selects every object, while this row makes a pixel
      // selection over the canvas (#1943).
      action: () => {
        setSelection({
          type: "rect",
          points: [],
          bounds: {
            x: 0,
            y: 0,
            width: canvasSize.width,
            height: canvasSize.height,
          },
        });
        onClose();
      },
      dividerAfter: true,
    },
    {
      id: "canvasSize",
      label: t.editor.menu.image.canvasSize,
      icon: Maximize,
      action: () => {
        onCanvasResize?.();
        onClose();
      },
    },
    {
      id: "imageSize",
      label: t.editor.menu.image.imageSize,
      icon: ImageIcon,
      action: () => {
        onImageResize?.();
        onClose();
      },
    },
  ];

  const items = menuType === "object" ? objectItems : canvasItems;

  // Adjust position to stay within viewport
  const adjustedX = Math.min(position.x, window.innerWidth - 220);
  const adjustedY = Math.min(position.y, window.innerHeight - items.length * 36);

  return (
    <div
      ref={menuRef}
      className={cn(
        "fixed z-50 min-w-[200px] rounded-lg border border-border bg-card py-1 shadow-lg",
        "animate-in fade-in-0 zoom-in-95",
      )}
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item) => (
        <div key={item.id}>
          <button
            type="button"
            onClick={item.action}
            disabled={item.disabled}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-1.5 text-start text-sm",
              "text-foreground hover:bg-muted transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            <item.icon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="text-xs text-muted-foreground">{item.shortcut}</span>
            )}
          </button>
          {item.dividerAfter && <div className="my-1 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}
