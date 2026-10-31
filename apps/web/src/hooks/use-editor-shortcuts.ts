// apps/web/src/hooks/use-editor-shortcuts.ts

import { useCallback, useEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { copyMergedToClipboard } from "@/components/editor/copy-merged";
import { polygonalLassoRefHolder } from "@/components/editor/tools/selection-tool";
import { useTranslation } from "@/contexts/i18n-context";
import { runEditorAction } from "@/lib/editor-action";
import { redoEditor, undoEditor, useEditorStore } from "@/stores/editor-store";
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
  disabled?: boolean;
}) {
  const disabled = callbacks?.disabled === true;
  const enabled = !disabled;
  const previousToolRef = useRef<ToolType | null>(null);
  const isSpaceHeldRef = useRef(false);
  const { t: translations } = useTranslation();
  const copyFailedMessage = translations.editor.ui.exportDialog.copyFailed;
  const actionFailedMessage = translations.common.somethingWentWrong;

  // ---- Tool shortcuts (single key, disabled when input focused) ----

  // V - Move tool
  useHotkeys(
    "v",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("move");
    },
    { preventDefault: true, enabled },
  );

  // M - Marquee selection (cycles rect/ellipse)
  useHotkeys(
    "m",
    () => {
      if (disabled || isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (MARQUEE_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, MARQUEE_CYCLE));
      } else {
        useEditorStore.getState().setTool("marquee-rect");
      }
    },
    { preventDefault: true, enabled },
  );

  // Shift+M - Cycle marquee subtypes
  useHotkeys(
    "shift+m",
    () => {
      if (disabled || isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      useEditorStore.getState().setTool(cycleSubtool(current, MARQUEE_CYCLE));
    },
    { preventDefault: true, enabled },
  );

  // L - Lasso tool (cycles freehand/polygonal)
  useHotkeys(
    "l",
    () => {
      if (disabled || isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (LASSO_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, LASSO_CYCLE));
      } else {
        useEditorStore.getState().setTool("lasso-free");
      }
    },
    { preventDefault: true, enabled },
  );

  // Shift+L - Cycle lasso subtypes
  useHotkeys(
    "shift+l",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore
        .getState()
        .setTool(cycleSubtool(useEditorStore.getState().activeTool, LASSO_CYCLE));
    },
    { preventDefault: true, enabled },
  );

  // W - Magic wand
  useHotkeys(
    "w",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("magic-wand");
    },
    { preventDefault: true, enabled },
  );

  // C - Crop tool
  useHotkeys(
    "c",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("crop");
    },
    { preventDefault: true, enabled },
  );

  // I - Eyedropper
  useHotkeys(
    "i",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("eyedropper");
    },
    { preventDefault: true, enabled },
  );

  // B - Brush tool
  useHotkeys(
    "b",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("brush");
    },
    { preventDefault: true, enabled },
  );

  // N - Pencil tool
  useHotkeys(
    "n",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("pencil");
    },
    { preventDefault: true, enabled },
  );

  // E - Eraser tool
  useHotkeys(
    "e",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("eraser");
    },
    { preventDefault: true, enabled },
  );

  // S - Clone stamp
  useHotkeys(
    "s",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("clone-stamp");
    },
    { preventDefault: true, enabled },
  );

  // O - Dodge tool
  useHotkeys(
    "o",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("dodge");
    },
    { preventDefault: true, enabled },
  );

  // G - Fill/Gradient (cycles)
  useHotkeys(
    "g",
    () => {
      if (disabled || isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (FILL_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, FILL_CYCLE));
      } else {
        useEditorStore.getState().setTool("fill");
      }
    },
    { preventDefault: true, enabled },
  );

  // Shift+G - Cycle fill/gradient subtypes
  useHotkeys(
    "shift+g",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore
        .getState()
        .setTool(cycleSubtool(useEditorStore.getState().activeTool, FILL_CYCLE));
    },
    { preventDefault: true, enabled },
  );

  // U - Shape tool (cycles shapes)
  useHotkeys(
    "u",
    () => {
      if (disabled || isInputFocused()) return;
      const current = useEditorStore.getState().activeTool;
      if (SHAPE_CYCLE.includes(current)) {
        useEditorStore.getState().setTool(cycleSubtool(current, SHAPE_CYCLE));
      } else {
        useEditorStore.getState().setTool("shape-rect");
      }
    },
    { preventDefault: true, enabled },
  );

  // Shift+U - Cycle shape subtypes
  useHotkeys(
    "shift+u",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore
        .getState()
        .setTool(cycleSubtool(useEditorStore.getState().activeTool, SHAPE_CYCLE));
    },
    { preventDefault: true, enabled },
  );

  // T - Text tool
  useHotkeys(
    "t",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("text");
    },
    { preventDefault: true, enabled },
  );

  // H - Hand tool
  useHotkeys(
    "h",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("hand");
    },
    { preventDefault: true, enabled },
  );

  // Z - Zoom tool
  useHotkeys(
    "z",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().setTool("zoom");
    },
    { preventDefault: true, enabled },
  );

  // ---- Color shortcuts ----

  // X - Swap foreground/background
  useHotkeys(
    "x",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().swapColors();
    },
    { preventDefault: true, enabled },
  );

  // D - Reset colors to black/white
  useHotkeys(
    "d",
    () => {
      if (disabled || isInputFocused()) return;
      useEditorStore.getState().resetColors();
    },
    { preventDefault: true, enabled },
  );

  // [ - Decrease brush size
  useHotkeys(
    "[",
    () => {
      if (disabled || isInputFocused()) return;
      const state = useEditorStore.getState();
      const step = getBrushSizeStep(state.brushSize);
      state.setBrushSize(state.brushSize - step);
    },
    { preventDefault: true, enabled },
  );

  // ] - Increase brush size
  useHotkeys(
    "]",
    () => {
      if (disabled || isInputFocused()) return;
      const state = useEditorStore.getState();
      const step = getBrushSizeStep(state.brushSize);
      state.setBrushSize(state.brushSize + step);
    },
    { preventDefault: true, enabled },
  );

  // ---- Modifier shortcuts (always active, override browser defaults) ----

  // Ctrl+Z / Cmd+Z - Undo
  useHotkeys(
    "mod+z",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      void undoEditor();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Shift+Z / Cmd+Shift+Z - Redo
  useHotkeys(
    "mod+shift+z",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      void redoEditor();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+S / Cmd+S - Save project
  useHotkeys(
    "mod+s",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      if (useEditorStore.getState().rebaking) return;
      callbacks?.onSave?.();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Shift+S / Cmd+Shift+S - Export image
  // Use a raw keydown listener at capture phase to reliably prevent the
  // browser's "Save Page As" dialog, which fires before react-hotkeys-hook
  // can intercept.
  const onExportRef = useRef(callbacks?.onExport);
  onExportRef.current = callbacks?.onExport;

  useEffect(() => {
    if (disabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        if (useEditorStore.getState().rebaking) return;
        onExportRef.current?.();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [disabled]);

  // Ctrl+A / Cmd+A - Select all (pixel selection over the whole canvas)
  useHotkeys(
    "mod+a",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      const { width, height } = state.canvasSize;
      state.setSelectedObjects([]);
      state.setSelection({
        type: "rect",
        points: [0, 0, width, 0, width, height, 0, height],
        bounds: { x: 0, y: 0, width, height },
      });
    },
    { preventDefault: true, enabled },
  );

  // Alt+Ctrl+A / Option+Cmd+A - Select all objects/layers
  useHotkeys(
    "alt+mod+a",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      const allIds = state.objects.map((o) => o.id);
      state.setSelection(null);
      state.setSelectedObjects(allIds);
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+D / Cmd+D - Deselect
  useHotkeys(
    "mod+d",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().setSelectedObjects([]);
      useEditorStore.getState().setSelection(null);
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+C / Cmd+C - Copy
  useHotkeys(
    "mod+c",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().copyObjects();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+X / Cmd+X - Cut
  useHotkeys(
    "mod+x",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().cutObjects();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+V / Cmd+V - Paste
  useHotkeys(
    "mod+v",
    (e) => {
      if (disabled || isInputFocused()) return;
      // Only paste internal clipboard; system paste is handled by paste event listener
      const state = useEditorStore.getState();
      if (state.clipboard && state.clipboard.length > 0) {
        e.preventDefault();
        state.pasteObjects();
      }
    },
    { preventDefault: false, enabled },
  );

  // Ctrl+Shift+C / Cmd+Shift+C - Copy merged
  useHotkeys(
    "mod+shift+c",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      void copyMergedToClipboard(copyFailedMessage);
    },
    { preventDefault: true, enabled },
    [copyFailedMessage, disabled],
  );

  // Ctrl+Shift+V / Cmd+Shift+V - Paste in place
  useHotkeys(
    "mod+shift+v",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().pasteInPlace();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Alt+T / Cmd+Option+T (plus Ctrl+T / Cmd+T in an installed PWA) - Free transform
  useHotkeys(
    "mod+alt+t,mod+t",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().setTool("transform");
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+J / Cmd+J - Duplicate layer
  useHotkeys(
    "mod+j",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      state.duplicateLayer(state.activeLayerId);
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Alt+Shift+N / Cmd+Option+Shift+N (plus Ctrl+Shift+N / Cmd+Shift+N in an installed PWA) - New layer
  useHotkeys(
    "mod+alt+shift+n,mod+shift+n",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      useEditorStore.getState().addLayer();
    },
    { preventDefault: true, enabled },
  );

  // Delete / Backspace - Delete selected objects
  useHotkeys(
    "delete,backspace",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length > 0) {
        state.removeObjects(state.selectedObjectIds);
      }
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+0 / Cmd+0 - Fit to screen
  useHotkeys(
    "mod+0",
    (e) => {
      if (disabled) return;
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
    { preventDefault: true, enabled },
  );

  // Ctrl+1 / Cmd+1 - Zoom to 100%
  useHotkeys(
    "mod+1",
    (e) => {
      if (disabled) return;
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
    { preventDefault: true, enabled },
  );

  // Ctrl++ / Cmd++ - Zoom in
  useHotkeys(
    "mod+=,mod+plus",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      state.setZoom(state.zoom * 1.25);
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+- / Cmd+- - Zoom out
  useHotkeys(
    "mod+-,mod+minus",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      state.setZoom(state.zoom / 1.25);
    },
    { preventDefault: true, enabled },
  );

  // Tab - Toggle right panel
  useHotkeys(
    "tab",
    (e) => {
      if (disabled || isInputFocused() || isNativeInteractiveTarget(e.target)) return;
      e.preventDefault();
      useEditorStore.getState().toggleRightPanel();
    },
    { preventDefault: false, enabled },
  );

  // Arrow keys - Nudge selected 1px
  useHotkeys(
    "left",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(-1, 0);
    },
    { preventDefault: true, enabled },
  );

  useHotkeys(
    "right",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(1, 0);
    },
    { preventDefault: true, enabled },
  );

  useHotkeys(
    "up",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, -1);
    },
    { preventDefault: true, enabled },
  );

  useHotkeys(
    "down",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, 1);
    },
    { preventDefault: true, enabled },
  );

  // Shift+Arrow - Nudge 10px
  useHotkeys(
    "shift+left",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(-10, 0);
    },
    { preventDefault: true, enabled },
  );

  useHotkeys(
    "shift+right",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(10, 0);
    },
    { preventDefault: true, enabled },
  );

  useHotkeys(
    "shift+up",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, -10);
    },
    { preventDefault: true, enabled },
  );

  useHotkeys(
    "shift+down",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      nudgeSelected(0, 10);
    },
    { preventDefault: true, enabled },
  );

  // Enter - Close an in-progress polygonal lasso, else apply the crop
  useHotkeys(
    "enter",
    (e) => {
      if (disabled || isInputFocused() || isNativeInteractiveTarget(e.target)) return;
      e.preventDefault();
      if (polygonalLassoRefHolder.current?.close()) return;
      const state = useEditorStore.getState();
      if (state.isCropping && state.cropState && !state.rebaking) {
        runEditorAction(state.applyCrop(), actionFailedMessage);
      }
    },
    { preventDefault: false, enabled },
  );

  // Escape - Cancel current operation
  useHotkeys(
    "escape",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      if (polygonalLassoRefHolder.current?.cancel()) return;
      const state = useEditorStore.getState();
      if (state.isCropping || state.cropState) {
        state.setCropState(null);
      }
      state.setSelectedObjects([]);
      state.setSelection(null);
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+R / Cmd+R - Toggle rulers (override browser refresh)
  useHotkeys(
    "mod+r",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      useEditorStore.getState().toggleRulers();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+; / Cmd+; - Toggle guides
  useHotkeys(
    "mod+;",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      useEditorStore.getState().toggleGuides();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+' / Cmd+' - Toggle grid
  useHotkeys(
    "mod+'",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      useEditorStore.getState().toggleGrid();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Shift+I / Cmd+Shift+I - Inverse selection
  useHotkeys(
    "mod+shift+i",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      useEditorStore.getState().invertSelection();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+E / Cmd+E - Merge down
  useHotkeys(
    "mod+e",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      state.mergeDown(state.activeLayerId);
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Shift+E / Cmd+Shift+E - Flatten all
  useHotkeys(
    "mod+shift+e",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      useEditorStore.getState().flattenAll();
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Shift+] / Cmd+Shift+] - Bring to front
  useHotkeys(
    "mod+shift+]",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.bringToFront(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+Shift+[ / Cmd+Shift+[ - Send to back
  useHotkeys(
    "mod+shift+[",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.sendToBack(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+] / Cmd+] - Bring forward
  useHotkeys(
    "mod+]",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.bringForward(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true, enabled },
  );

  // Ctrl+[ / Cmd+[ - Send backward
  useHotkeys(
    "mod+[",
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const state = useEditorStore.getState();
      if (state.selectedObjectIds.length === 1) {
        state.sendBackward(state.selectedObjectIds[0]);
      }
    },
    { preventDefault: true, enabled },
  );

  // Shift+Backspace - Open fill dialog
  useHotkeys(
    "shift+backspace",
    (e) => {
      if (disabled || isInputFocused()) return;
      e.preventDefault();
      if (callbacks?.onFillDialog) {
        callbacks.onFillDialog();
      } else {
        // Fallback: dispatch custom event for FillDialog listener
        window.dispatchEvent(new CustomEvent("snapotter:open-fill-dialog"));
      }
    },
    { preventDefault: true, enabled },
  );

  // ---- Space key: temporary hand tool ----

  useEffect(() => {
    if (!disabled || !isSpaceHeldRef.current) return;
    isSpaceHeldRef.current = false;
    useEditorStore.setState({ isSpaceHeld: false });
    if (previousToolRef.current) {
      useEditorStore.getState().setTool(previousToolRef.current);
      previousToolRef.current = null;
    }
  }, [disabled]);

  const handleSpaceDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled || isInputFocused() || isNativeInteractiveTarget(e.target)) return;
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
    },
    [disabled],
  );

  const handleSpaceUp = useCallback(
    (e: KeyboardEvent) => {
      if (disabled && !isSpaceHeldRef.current) return;
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
    },
    [disabled],
  );

  useEffect(() => {
    if (disabled) return;
    window.addEventListener("keydown", handleSpaceDown);
    window.addEventListener("keyup", handleSpaceUp);
    return () => {
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
    };
  }, [disabled, handleSpaceDown, handleSpaceUp]);
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
    lastAction: { id: "nudge" },
  }));
}
