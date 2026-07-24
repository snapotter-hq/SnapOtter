// apps/web/src/hooks/use-editor-shortcuts.ts

import { useCallback, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { editorStageRefHolder } from "@/components/editor/editor-canvas";
import { useEditorStore } from "@/stores/editor-store";
import type { ToolType } from "@/types/editor";

/**
 * Checks whether the currently focused element is a text input
 * (input, textarea, select, or contentEditable) so tool‑shortcut
 * single‑letter keys can be suppressed while the user is typing.
 */
function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function isNativeInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('a[href], button, input, select, textarea, [contenteditable="true"]') !== null
  );
}

// Brush size step depends on current size for natural feel
function getBrushSizeStep(current: number): number {
  if (current < 10) return 1;
  if (current < 50) return 2;
  if (current < 100) return 5;
  return 10;
}

// Marquee subtypes cycle
const MARQUEE_CYCLE: ToolType[] = ["marquee-rect", "marquee-ellipse"];
// Lasso subtypes cycle
const LASSO_CYCLE: ToolType[] = ["lasso-free", "lasso-poly"];
// Shape subtypes cycle
const SHAPE_CYCLE: ToolType[] = [
  "shape-rect",
  "shape-ellipse",
  "shape-line",
  "shape-arrow",
  "shape-polygon",
  "shape-star",
];
// Fill/gradient cycle
const FILL_CYCLE: ToolType[] = ["fill", "gradient"];

function cycleSubtool(current: ToolType, cycle: ToolType[]): ToolType {
  const idx = cycle.indexOf(current);
  if (idx === -1) return cycle[0];
  return cycle[(idx + 1) % cycle.length];
}

/**
 * Registers all editor keyboard shortcuts.
 * Must be called once inside the editor page component.
 *
 * @param callbacks Optional callbacks for save/export dialogs
 */
export function useEditorShortcuts(callbacks?: {
  onSave?: () => void;
  onExport?: () => void;
  onFillDialog?: () => void;
}) {
  const previousToolRef = useRef<ToolType | null>(null);
  const isSpaceHeldRef = useRef(false);

  // ---- Tool shortcuts (single key, disabled when input focused) ----

  // V - Move tool
  useHotkeys(
    "v",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("move");
    },
    { preventDefault: true },
  );

  // M - Marquee selection (cycles rect/ellipse)
  useHotkeys(
    "m",
    () => {
      if (isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (MARQUEE_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, MARQUEE_CYCLE));
      } else {
        useEditorStore.getState().setTool("marquee-rect");
      }
    },
    { preventDefault: true },
  );

  // Shift+M - Cycle marquee subtypes
  useHotkeys(
    "shift+m",
    () => {
      if (isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      useEditorStore.getState().setTool(cycleSubtool(current, MARQUEE_CYCLE));
    },
    { preventDefault: true },
  );

  // L - Lasso tool (cycles freehand/polygonal)
  useHotkeys(
    "l",
    () => {
      if (isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (LASSO_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, LASSO_CYCLE));
      } else {
        useEditorStore.getState().setTool("lasso-free");
      }
    },
    { preventDefault: true },
  );

  // Shift+L - Cycle lasso subtypes
  useHotkeys(
    "shift+l",
    () => {
      if (isInputFocused()) return;
      useEditorStore
        .getState()
        .setTool(cycleSubtool(useEditorStore.getState().activeTool, LASSO_CYCLE));
    },
    { preventDefault: true },
  );

  // W - Magic wand
  useHotkeys(
    "w",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("magic-wand");
    },
    { preventDefault: true },
  );

  // C - Crop tool
  useHotkeys(
    "c",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("crop");
    },
    { preventDefault: true },
  );

  // I - Eyedropper
  useHotkeys(
    "i",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("eyedropper");
    },
    { preventDefault: true },
  );

  // B - Brush tool
  useHotkeys(
    "b",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("brush");
    },
    { preventDefault: true },
  );

  // N - Pencil tool
  useHotkeys(
    "n",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("pencil");
    },
    { preventDefault: true },
  );

  // E - Eraser tool
  useHotkeys(
    "e",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("eraser");
    },
    { preventDefault: true },
  );

  // S - Clone stamp
  useHotkeys(
    "s",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("clone-stamp");
    },
    { preventDefault: true },
  );

  // O - Dodge tool
  useHotkeys(
    "o",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("dodge");
    },
    { preventDefault: true },
  );

  // G - Fill/Gradient (cycles)
  useHotkeys(
    "g",
    () => {
      if (isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (FILL_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, FILL_CYCLE));
      } else {
        useEditorStore.getState().setTool("fill");
      }
    },
    { preventDefault: true },
  );

  // Shift+G - Cycle fill/gradient subtypes
  useHotkeys(
    "shift+g",
    () => {
      if (isInputFocused()) return;
      useEditorStore
        .getState()
        .setTool(cycleSubtool(useEditorStore.getState().activeTool, FILL_CYCLE));
    },
    { preventDefault: true },
  );

  // U - Shape tool (cycles shapes)
  useHotkeys(
    "u",
    () => {
      if (isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (SHAPE_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, SHAPE_CYCLE));
      } else {
        useEditorStore.getState().setTool("shape-rect");
      }
    },
    { preventDefault: true },
  );

  // Shift+U - Cycle shape subtypes
  useHotkeys(
    "shift+u",
    () => {
      if (isInputFocused()) return;
      useEditorStore
        .getState()
        .setTool(cycleSubtool(useEditorStore.getState().activeTool, SHAPE_CYCLE));
    },
    { preventDefault: true },
  );

  // T - Text tool
  useHotkeys(
    "t",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("text");
    },
    { preventDefault: true },
  );

  // H - Hand tool
  useHotkeys(
    "h",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("hand");
    },
    { preventDefault: true },
  );

  // Z - Zoom tool
  useHotkeys(
    "z",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().setTool("zoom");
    },
    { preventDefault: true },
  );

  // ---- Color shortcuts ----

  // X - Swap foreground/background
  useHotkeys(
    "x",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().swapColors();
    },
    { preventDefault: true },
  );

  // D - Reset colors to black/white
  useHotkeys(
    "d",
    () => {
      if (isInputFocused()) return;
      useEditorStore.getState().resetColors();
    },
    { preventDefault: true },
  );

  // [ - Decrease brush size
  useHotkeys(
    "[",
    () => {
      if (isInputFocused()) return;
      const state = useEditorStore.getState();
      const step = getBrushSizeStep(state.brushSize);
      state.setBrushSize(state.brushSize - step);
    },
    { preventDefault: true },
  );

  // ] - Increase brush size
  useHotkeys(
    "]",
    () => {
      if (isInputFocused()) return;
      const state = useEditorStore.getState();
      const step = getBrushSizeStep(state.brushSize);
      state.setBrushSize(state.brushSize + step);
    },
    { preventDefault: true },
  );

  // ---- Modifier shortcuts (always active, override browser defaults) ----

  // Ctrl+Z / Cmd+Z - Undo
  useHotkeys(
    "mod+z",
    (e) => {
      e.preventDefault();
      useEditorStore.temporal.getState().undo();
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+Z / Cmd+Shift+Z - Redo
  useHotkeys(
    "mod+shift+z",
    (e) => {
      e.preventDefault();
      useEditorStore.temporal.getState().redo();
    },
    { preventDefault: true },
  );

  // Ctrl+S / Cmd+S - Save project
  useHotkeys(
    "mod+s",
    (e) => {
      e.preventDefault();
      callbacks?.onSave?.();
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+S / Cmd+Shift+S - Export image
  // Use a raw keydown listener at capture phase to reliably prevent the
  // browser's "Save Page As" dialog, which fires before react-hotkeys-hook
  // can intercept.
  const onExportRef = useRef(callbacks?.onExport);
  onExportRef.current = callbacks?.onExport;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        onExportRef.current?.();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);

  // Ctrl+A / Cmd+A - Select all
  useHotkeys(
    "mod+a",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      const allIds = state.objects.map((o) => o.id);
      state.setSelectedObjects(allIds);
    },
    { preventDefault: true },
  );

  // Ctrl+D / Cmd+D - Deselect
  useHotkeys(
    "mod+d",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().setSelectedObjects([]);
      useEditorStore.getState().setSelection(null);
    },
    { preventDefault: true },
  );

  // Ctrl+C / Cmd+C - Copy
  useHotkeys(
    "mod+c",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().copyObjects();
    },
    { preventDefault: true },
  );

  // Ctrl+X / Cmd+X - Cut
  useHotkeys(
    "mod+x",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().cutObjects();
    },
    { preventDefault: true },
  );

  // Ctrl+V / Cmd+V - Paste
  useHotkeys(
    "mod+v",
    (e) => {
      if (isInputFocused()) return;
      // Only paste internal clipboard; system paste is handled by paste event listener
      const state = useEditorStore.getState();
      if (state.clipboard && state.clipboard.length > 0) {
        e.preventDefault();
        state.pasteObjects();
      }
    },
    { preventDefault: false },
  );

  // Ctrl+Shift+C / Cmd+Shift+C - Copy merged (use Konva stage ref for proper composite)
  useHotkeys(
    "mod+shift+c",
    (e) => {
      e.preventDefault();
      const stage = editorStageRefHolder.current;
      if (!stage) return;
      const { canvasSize } = useEditorStore.getState();
      const dataUrl = stage.toDataURL({
        pixelRatio: 1,
        mimeType: "image/png",
        x: 0,
        y: 0,
        width: canvasSize.width,
        height: canvasSize.height,
      });
      fetch(dataUrl)
        .then((res) => res.blob())
        .then(async (blob) => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          } catch {
            // Clipboard API not available
          }
        })
        .catch(() => {
          // Export failed silently
        });
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+V / Cmd+Shift+V - Paste in place
  useHotkeys(
    "mod+shift+v",
    (e) => {
      e.preventDefault();
      useEditorStore.getState().pasteInPlace();
    },
    { preventDefault: true },
  );

  // Ctrl+T / Cmd+T - Free transform
  useHotkeys(
    "mod+t",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().setTool("transform");
    },
    { preventDefault: true },
  );

  // Ctrl+J / Cmd+J - Duplicate layer
  useHotkeys(
    "mod+j",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      state.duplicateLayer(state.activeLayerId);
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+N / Cmd+Shift+N - New layer
  useHotkeys(
    "mod+shift+n",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().addLayer();
    },
    { preventDefault: true },
  );

  // Delete / Backspace - Delete selected objects
  useHotkeys(
    "delete,backspace",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length > 0) {
        state.removeObjects(state.selectedObjectIds);
      }
    },
    { preventDefault: true },
  );

  // Ctrl+0 / Cmd+0 - Fit to screen
  useHotkeys(
    "mod+0",
    (e) => {
      e.preventDefault();
      const editorCanvas = document.querySelector("[data-testid='editor-canvas']");
      if (!editorCanvas) return;
      const { width: vw, height: vh } = editorCanvas.getBoundingClientRect();
      const { canvasSize } = useEditorStore.getState();
      const scaleX = vw / canvasSize.width;
      const scaleY = vh / canvasSize.height;
      const fitZoom = Math.min(scaleX, scaleY) * 0.9;
      const offsetX = (vw - canvasSize.width * fitZoom) / 2;
      const offsetY = (vh - canvasSize.height * fitZoom) / 2;
      useEditorStore.getState().setZoom(fitZoom);
      useEditorStore.getState().setPanOffset({ x: offsetX, y: offsetY });
    },
    { preventDefault: true },
  );

  // Ctrl+1 / Cmd+1 - Zoom to 100%
  useHotkeys(
    "mod+1",
    (e) => {
      e.preventDefault();
      const editorCanvas = document.querySelector("[data-testid='editor-canvas']");
      if (!editorCanvas) return;
      const { width: vw, height: vh } = editorCanvas.getBoundingClientRect();
      const { canvasSize } = useEditorStore.getState();
      const offsetX = (vw - canvasSize.width) / 2;
      const offsetY = (vh - canvasSize.height) / 2;
      useEditorStore.getState().setZoom(1);
      useEditorStore.getState().setPanOffset({ x: offsetX, y: offsetY });
    },
    { preventDefault: true },
  );

  // Ctrl++ / Cmd++ - Zoom in
  useHotkeys(
    "mod+=,mod+plus",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      state.setZoom(state.zoom * 1.25);
    },
    { preventDefault: true },
  );

  // Ctrl+- / Cmd+- - Zoom out
  useHotkeys(
    "mod+-,mod+minus",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      state.setZoom(state.zoom / 1.25);
    },
    { preventDefault: true },
  );

  // Tab - Toggle right panel
  useHotkeys(
    "tab",
    (e) => {
      if (isInputFocused() || isNativeInteractiveTarget(e.target)) return;
      e.preventDefault();
      useEditorStore.getState().toggleRightPanel();
    },
    { preventDefault: false },
  );

  // Arrow keys - Nudge selected 1px
  useHotkeys(
    "left",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(-1, 0);
    },
    { preventDefault: true },
  );

  useHotkeys(
    "right",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(1, 0);
    },
    { preventDefault: true },
  );

  useHotkeys(
    "up",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, -1);
    },
    { preventDefault: true },
  );

  useHotkeys(
    "down",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, 1);
    },
    { preventDefault: true },
  );

  // Shift+Arrow - Nudge 10px
  useHotkeys(
    "shift+left",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(-10, 0);
    },
    { preventDefault: true },
  );

  useHotkeys(
    "shift+right",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(10, 0);
    },
    { preventDefault: true },
  );

  useHotkeys(
    "shift+up",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, -10);
    },
    { preventDefault: true },
  );

  useHotkeys(
    "shift+down",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, 10);
    },
    { preventDefault: true },
  );

  // Enter - Apply current operation (crop, transform)
  useHotkeys(
    "enter",
    (e) => {
      if (isInputFocused() || isNativeInteractiveTarget(e.target)) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.isCropping && state.cropState) {
        state.applyCrop();
      }
    },
    { preventDefault: false },
  );

  // Escape - Cancel current operation
  useHotkeys(
    "escape",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.isCropping) {
        state.setCropState(null);
      }
      state.setSelectedObjects([]);
      state.setSelection(null);
    },
    { preventDefault: true },
  );

  // Ctrl+R / Cmd+R - Toggle rulers (override browser refresh)
  useHotkeys(
    "mod+r",
    (e) => {
      e.preventDefault();
      useEditorStore.getState().toggleRulers();
    },
    { preventDefault: true },
  );

  // Ctrl+; / Cmd+; - Toggle guides
  useHotkeys(
    "mod+;",
    (e) => {
      e.preventDefault();
      useEditorStore.getState().toggleGuides();
    },
    { preventDefault: true },
  );

  // Ctrl+' / Cmd+' - Toggle grid
  useHotkeys(
    "mod+'",
    (e) => {
      e.preventDefault();
      useEditorStore.getState().toggleGrid();
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+I / Cmd+Shift+I - Inverse selection
  useHotkeys(
    "mod+shift+i",
    (e) => {
      e.preventDefault();
      useEditorStore.getState().invertSelection();
    },
    { preventDefault: true },
  );

  // Ctrl+E / Cmd+E - Merge down
  useHotkeys(
    "mod+e",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      state.mergeDown(state.activeLayerId);
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+E / Cmd+Shift+E - Flatten all
  useHotkeys(
    "mod+shift+e",
    (e) => {
      e.preventDefault();
      useEditorStore.getState().flattenAll();
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+] / Cmd+Shift+] - Bring to front
  useHotkeys(
    "mod+shift+]",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.bringToFront(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true },
  );

  // Ctrl+Shift+[ / Cmd+Shift+[ - Send to back
  useHotkeys(
    "mod+shift+[",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.sendToBack(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true },
  );

  // Ctrl+] / Cmd+] - Bring forward
  useHotkeys(
    "mod+]",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.bringForward(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true },
  );

  // Ctrl+[ / Cmd+[ - Send backward
  useHotkeys(
    "mod+[",
    (e) => {
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.sendBackward(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true },
  );

  // Shift+Backspace - Open fill dialog
  useHotkeys(
    "shift+backspace",
    (e) => {
      if (isInputFocused()) return;
      e.preventDefault();
      if (callbacks?.onFillDialog) {
        callbacks.onFillDialog();
      } else {
        // Fallback: dispatch custom event for FillDialog listener
        window.dispatchEvent(new CustomEvent("snapotter:open-fill-dialog"));
      }
    },
    { preventDefault: true },
  );

  // ---- Space key: temporary hand tool ----

  const handleSpaceDown = useCallback((e: KeyboardEvent) => {
    if (isInputFocused() || isNativeInteractiveTarget(e.target)) return;
    if (e.code !== "Space") return;
    if (e.repeat) return;
    e.preventDefault();

    isSpaceHeldRef.current = true;
    const state = useEditorStore.getState();
    if (state.activeTool !== "hand") {
      previousToolRef.current = state.activeTool;
      useEditorStore.setState({ isSpaceHeld: true });
      state.setTool("hand");
    }
  }, []);

  const handleSpaceUp = useCallback((e: KeyboardEvent) => {
    if (e.code !== "Space") return;
    if (!isSpaceHeldRef.current && isNativeInteractiveTarget(e.target)) return;
    e.preventDefault();

    if (isSpaceHeldRef.current) {
      isSpaceHeldRef.current = false;
      useEditorStore.setState({ isSpaceHeld: false });
      if (previousToolRef.current) {
        useEditorStore.getState().setTool(previousToolRef.current);
        previousToolRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleSpaceDown);
    window.addEventListener("keyup", handleSpaceUp);
    return () => {
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
    };
  }, [handleSpaceDown, handleSpaceUp]);
}

/** Nudge all selected objects by (dx, dy) pixels. */
function nudgeSelected(dx: number, dy: number): void {
  const state = useEditorStore.getState();
  if (state.selectedObjectIds.length === 0) return;
  for (const id of state.selectedObjectIds) {
    const obj = state.objects.find((o) => o.id === id);
    if (!obj) continue;
    const attrs = obj.attrs;
    if ("x" in attrs && "y" in attrs) {
      state.updateObject(id, {
        x: (attrs as { x: number }).x + dx,
        y: (attrs as { y: number }).y + dy,
      });
    }
  }
  // Create a history entry so the nudge is undoable
  useEditorStore.setState((s) => ({
    _historyVersion: s._historyVersion + 1,
    lastAction: "Nudge",
  }));
}
