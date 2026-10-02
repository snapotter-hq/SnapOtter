// apps/web/src/components/editor/editor-menu-bar.tsx

import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "@/contexts/i18n-context";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { hotkeysModIsMeta } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

export interface MenuBarCallbacks {
  onNewDocument: () => void;
  onOpenImage: () => void;
  onExport: () => void;
  onSave: () => void;
  onCanvasResize: () => void;
  onImageResize: () => void;
}

interface MenuItem {
  /**
   * Locale-stable slug for data-testid (menu-item-<id>) and React keys. The
   * editor e2e suite selects on these, so they keep the values the old
   * English-label slugs produced, whatever locale renders the label.
   */
  id: string;
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  submenu?: MenuItem[];
  dividerAfter?: boolean;
}

interface MenuDef {
  label: string;
  testId: string;
  items: MenuItem[];
}

function useMenuDefinitions(callbacks: MenuBarCallbacks): MenuDef[] {
  const { t } = useTranslation();
  const m = t.editor.menu;
  // The editor's shortcuts are react-hotkeys-hook bindings, so `mod` follows
  // that library's rule (Ctrl on an iPad's mobile user agent, for one).
  const modIsMeta = hotkeysModIsMeta();
  const hint = (keys: string) => formatShortcut(keys, modIsMeta);
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);
  const layers = useEditorStore((s) => s.layers);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const rulersVisible = useEditorStore((s) => s.rulersVisible);
  const gridVisible = useEditorStore((s) => s.gridVisible);
  const guidesVisible = useEditorStore((s) => s.guidesVisible);
  const snappingEnabled = useEditorStore((s) => s.snappingEnabled);
  const rightPanelVisible = useEditorStore((s) => s.rightPanelVisible);
  const setTool = useEditorStore((s) => s.setTool);
  const setZoom = useEditorStore((s) => s.setZoom);
  const zoom = useEditorStore((s) => s.zoom);
  const addLayer = useEditorStore((s) => s.addLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const mergeDown = useEditorStore((s) => s.mergeDown);
  const flattenAll = useEditorStore((s) => s.flattenAll);
  const setSelection = useEditorStore((s) => s.setSelection);
  const invertSelection = useEditorStore((s) => s.invertSelection);
  const canvasSize = useEditorStore((s) => s.canvasSize);
  const setPanOffset = useEditorStore((s) => s.setPanOffset);
  const rotateCanvas = useEditorStore((s) => s.rotateCanvas);
  const flipCanvasHorizontal = useEditorStore((s) => s.flipCanvasHorizontal);
  const flipCanvasVertical = useEditorStore((s) => s.flipCanvasVertical);
  const trimCanvas = useEditorStore((s) => s.trimCanvas);
  const toggleFilter = useEditorStore((s) => s.toggleFilter);
  const toggleRulers = useEditorStore((s) => s.toggleRulers);
  const toggleGrid = useEditorStore((s) => s.toggleGrid);
  const toggleGuides = useEditorStore((s) => s.toggleGuides);
  const toggleSnapping = useEditorStore((s) => s.toggleSnapping);
  const toggleRightPanel = useEditorStore((s) => s.toggleRightPanel);
  const copyObjects = useEditorStore((s) => s.copyObjects);
  const cutObjects = useEditorStore((s) => s.cutObjects);
  const pasteObjects = useEditorStore((s) => s.pasteObjects);
  const pasteInPlace = useEditorStore((s) => s.pasteInPlace);
  const removeObjects = useEditorStore((s) => s.removeObjects);
  const selectedObjectIds = useEditorStore((s) => s.selectedObjectIds);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const hasImage = !!sourceImageUrl;
  const activeIndex = layers.findIndex((l) => l.id === activeLayerId);
  const singleLayer = layers.length <= 1;
  const undo = useCallback(() => {
    useEditorStore.temporal.getState().undo();
  }, []);
  const redo = useCallback(() => {
    useEditorStore.temporal.getState().redo();
  }, []);

  return [
    {
      label: m.file.label,
      testId: "file",
      items: [
        { id: "new", label: m.file.new, shortcut: hint("mod+N"), action: callbacks.onNewDocument },
        { id: "open", label: m.file.open, shortcut: hint("mod+O"), action: callbacks.onOpenImage },
        {
          id: "save",
          label: m.file.save,
          shortcut: hint("mod+S"),
          action: callbacks.onSave,
          dividerAfter: true,
        },
        {
          id: "export-as",
          label: m.file.exportAs,
          shortcut: hint("mod+Shift+E"),
          action: callbacks.onExport,
        },
        {
          id: "quick-export-as-png",
          label: m.file.quickExportPng,
          shortcut: hint("mod+Shift+P"),
          action: callbacks.onExport,
        },
        {
          id: "close",
          label: m.file.close,
          shortcut: hint("mod+W"),
          disabled: !hasImage,
          action: () => {
            if (hasImage) {
              useEditorStore.setState({
                sourceImageUrl: null,
                sourceImageSize: null,
                objects: [],
                selectedObjectIds: [],
              });
            }
          },
        },
      ],
    },
    {
      label: m.edit.label,
      testId: "edit",
      items: [
        { id: "undo", label: m.edit.undo, shortcut: hint("mod+Z"), action: undo },
        {
          id: "redo",
          label: m.edit.redo,
          shortcut: hint("mod+Shift+Z"),
          action: redo,
          dividerAfter: true,
        },
        { id: "cut", label: m.edit.cut, shortcut: hint("mod+X"), action: cutObjects },
        { id: "copy", label: m.edit.copy, shortcut: hint("mod+C"), action: copyObjects },
        {
          id: "copy-merged",
          label: m.edit.copyMerged,
          shortcut: hint("mod+Shift+C"),
          action: copyObjects,
        },
        { id: "paste", label: m.edit.paste, shortcut: hint("mod+V"), action: pasteObjects },
        {
          id: "paste-in-place",
          label: m.edit.pasteInPlace,
          shortcut: hint("mod+Shift+V"),
          action: pasteInPlace,
          dividerAfter: true,
        },
        {
          id: "delete",
          label: m.edit.delete,
          shortcut: "Del",
          action: () => removeObjects(selectedObjectIds),
          disabled: selectedObjectIds.length === 0,
        },
        {
          id: "free-transform",
          label: m.edit.freeTransform,
          shortcut: hint("mod+T"),
          action: () => setTool("transform"),
          dividerAfter: true,
        },
        {
          id: "transform",
          label: m.edit.transform.label,
          submenu: [
            { id: "scale", label: m.edit.transform.scale, action: () => setTool("transform") },
            { id: "rotate", label: m.edit.transform.rotate, action: () => setTool("transform") },
            { id: "skew", label: m.edit.transform.skew, action: () => setTool("transform") },
            {
              id: "flip-horizontal",
              label: m.edit.transform.flipHorizontal,
              action: flipCanvasHorizontal,
            },
            {
              id: "flip-vertical",
              label: m.edit.transform.flipVertical,
              action: flipCanvasVertical,
            },
          ],
        },
      ],
    },
    {
      label: m.image.label,
      testId: "image",
      items: [
        {
          id: "image-size",
          label: m.image.imageSize,
          shortcut: hint("mod+Alt+I"),
          action: callbacks.onImageResize,
          dividerAfter: true,
        },
        {
          id: "canvas-size",
          label: m.image.canvasSize,
          shortcut: hint("mod+Alt+C"),
          action: callbacks.onCanvasResize,
        },
        {
          id: "image-rotation",
          label: m.image.rotation.label,
          submenu: [
            { id: "90-cw", label: m.image.rotation.cw90, action: () => rotateCanvas(90) },
            { id: "90-ccw", label: m.image.rotation.ccw90, action: () => rotateCanvas(270) },
            { id: "180", label: m.image.rotation.r180, action: () => rotateCanvas(180) },
            {
              id: "flip-horizontal",
              label: m.image.rotation.flipHorizontal,
              action: flipCanvasHorizontal,
            },
            {
              id: "flip-vertical",
              label: m.image.rotation.flipVertical,
              action: flipCanvasVertical,
            },
          ],
          dividerAfter: true,
        },
        { id: "trim", label: m.image.trim, action: trimCanvas },
        {
          id: "adjustments",
          label: m.image.adjustments.label,
          submenu: [
            { id: "brightness-contrast", label: m.image.adjustments.brightnessContrast },
            { id: "hue-saturation", label: m.image.adjustments.hueSaturation },
            { id: "color-balance", label: m.image.adjustments.colorBalance },
            { id: "levels", label: m.image.adjustments.levels },
            { id: "curves", label: m.image.adjustments.curves },
          ],
        },
      ],
    },
    {
      label: m.layer.label,
      testId: "layer",
      items: [
        {
          id: "new-layer",
          label: m.layer.newLayer,
          shortcut: hint("mod+Shift+N"),
          action: addLayer,
        },
        {
          id: "duplicate-layer",
          label: m.layer.duplicateLayer,
          action: () => duplicateLayer(activeLayerId),
        },
        {
          id: "delete-layer",
          label: m.layer.deleteLayer,
          action: () => removeLayer(activeLayerId),
          disabled: singleLayer,
          dividerAfter: true,
        },
        {
          id: "arrange",
          label: m.layer.arrange.label,
          submenu: [
            {
              id: "bring-to-front",
              label: m.layer.arrange.bringToFront,
              action: () => {
                if (selectedObjectIds[0]) bringToFront(selectedObjectIds[0]);
              },
            },
            {
              id: "bring-forward",
              label: m.layer.arrange.bringForward,
              action: () => {
                if (selectedObjectIds[0]) bringForward(selectedObjectIds[0]);
              },
            },
            {
              id: "send-backward",
              label: m.layer.arrange.sendBackward,
              action: () => {
                if (selectedObjectIds[0]) sendBackward(selectedObjectIds[0]);
              },
            },
            {
              id: "send-to-back",
              label: m.layer.arrange.sendToBack,
              action: () => {
                if (selectedObjectIds[0]) sendToBack(selectedObjectIds[0]);
              },
            },
          ],
          dividerAfter: true,
        },
        {
          id: "merge-down",
          label: m.layer.mergeDown,
          shortcut: hint("mod+E"),
          action: () => mergeDown(activeLayerId),
          disabled: activeIndex <= 0,
        },
        { id: "flatten-image", label: m.layer.flattenImage, action: flattenAll },
      ],
    },
    {
      label: m.select.label,
      testId: "select",
      items: [
        {
          id: "all",
          label: m.select.all,
          shortcut: hint("mod+A"),
          action: () =>
            setSelection({
              type: "rect",
              points: [
                0,
                0,
                canvasSize.width,
                0,
                canvasSize.width,
                canvasSize.height,
                0,
                canvasSize.height,
              ],
              bounds: { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
            }),
        },
        {
          id: "deselect",
          label: m.select.deselect,
          shortcut: hint("mod+D"),
          action: () => setSelection(null),
          dividerAfter: true,
        },
        {
          id: "inverse",
          label: m.select.inverse,
          shortcut: hint("mod+Shift+I"),
          action: invertSelection,
        },
        { id: "color-range", label: m.select.colorRange },
      ],
    },
    {
      label: m.filter.label,
      testId: "filter",
      items: [
        {
          id: "blur",
          label: m.filter.blur.label,
          submenu: [
            {
              id: "gaussian-blur",
              label: m.filter.blur.gaussian,
              action: () => toggleFilter("blur"),
            },
            {
              id: "motion-blur",
              label: m.filter.blur.motion,
              action: () => toggleFilter("motionBlur"),
            },
            {
              id: "radial-blur",
              label: m.filter.blur.radial,
              action: () => toggleFilter("radialBlur"),
            },
            {
              id: "surface-blur",
              label: m.filter.blur.surface,
              action: () => toggleFilter("surfaceBlur"),
            },
          ],
        },
        {
          id: "sharpen",
          label: m.filter.sharpen.label,
          submenu: [
            {
              id: "sharpen",
              label: m.filter.sharpen.sharpen,
              action: () => toggleFilter("sharpen"),
            },
            { id: "unsharp-mask", label: m.filter.sharpen.unsharpMask },
          ],
        },
        {
          id: "noise",
          label: m.filter.noise.label,
          submenu: [
            {
              id: "add-noise",
              label: m.filter.noise.addNoise,
              action: () => toggleFilter("noise"),
            },
            { id: "reduce-noise", label: m.filter.noise.reduceNoise },
          ],
        },
        {
          id: "pixelate",
          label: m.filter.pixelate.label,
          submenu: [
            {
              id: "pixelate",
              label: m.filter.pixelate.pixelate,
              action: () => toggleFilter("pixelate"),
            },
            { id: "mosaic", label: m.filter.pixelate.mosaic },
          ],
        },
        {
          id: "stylize",
          label: m.filter.stylize.label,
          submenu: [
            { id: "emboss", label: m.filter.stylize.emboss, action: () => toggleFilter("emboss") },
            {
              id: "solarize",
              label: m.filter.stylize.solarize,
              action: () => toggleFilter("solarize"),
            },
            {
              id: "posterize",
              label: m.filter.stylize.posterize,
              action: () => toggleFilter("posterize"),
            },
          ],
          dividerAfter: true,
        },
        { id: "grayscale", label: m.filter.grayscale, action: () => toggleFilter("grayscale") },
        { id: "sepia", label: m.filter.sepia, action: () => toggleFilter("sepia") },
        { id: "invert", label: m.filter.invert, action: () => toggleFilter("invert") },
      ],
    },
    {
      label: m.view.label,
      testId: "view",
      items: [
        {
          id: "zoom-in",
          label: m.view.zoomIn,
          shortcut: hint("mod+="),
          action: () => setZoom(zoom * 1.25),
        },
        {
          id: "zoom-out",
          label: m.view.zoomOut,
          shortcut: hint("mod+-"),
          action: () => setZoom(zoom / 1.25),
        },
        {
          id: "fit-on-screen",
          label: m.view.fitOnScreen,
          shortcut: hint("mod+0"),
          action: () => {
            const editorCanvas = document.querySelector("[data-testid='editor-canvas']");
            if (!editorCanvas) return;
            const { width: vw, height: vh } = editorCanvas.getBoundingClientRect();
            const scaleX = vw / canvasSize.width;
            const scaleY = vh / canvasSize.height;
            const fitZoom = Math.min(scaleX, scaleY) * 0.9;
            const offsetX = (vw - canvasSize.width * fitZoom) / 2;
            const offsetY = (vh - canvasSize.height * fitZoom) / 2;
            setZoom(fitZoom);
            setPanOffset({ x: offsetX, y: offsetY });
          },
        },
        {
          id: "actual-pixels",
          label: m.view.actualPixels,
          shortcut: hint("mod+1"),
          action: () => {
            const editorCanvas = document.querySelector("[data-testid='editor-canvas']");
            if (!editorCanvas) return;
            const { width: vw, height: vh } = editorCanvas.getBoundingClientRect();
            const offsetX = (vw - canvasSize.width) / 2;
            const offsetY = (vh - canvasSize.height) / 2;
            setZoom(1);
            setPanOffset({ x: offsetX, y: offsetY });
          },
          dividerAfter: true,
        },
        { id: "rulers", label: m.view.rulers, checked: rulersVisible, action: toggleRulers },
        { id: "grid", label: m.view.grid, checked: gridVisible, action: toggleGrid },
        { id: "guides", label: m.view.guides, checked: guidesVisible, action: toggleGuides },
        {
          id: "snap",
          label: m.view.snap,
          checked: snappingEnabled,
          action: toggleSnapping,
          dividerAfter: true,
        },
        {
          id: "panels",
          label: m.view.panels,
          checked: rightPanelVisible,
          action: toggleRightPanel,
        },
      ],
    },
  ];
}

function MenuItemRow({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleEnter = () => {
    if (item.submenu) {
      clearTimeout(timerRef.current);
      setSubmenuOpen(true);
    }
  };
  const handleLeave = () => {
    if (item.submenu) {
      timerRef.current = setTimeout(() => setSubmenuOpen(false), 150);
    }
  };
  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (item.submenu) {
    return (
      <div
        className="relative"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        role="menuitem"
        tabIndex={0}
      >
        <div
          className={cn(
            "flex items-center justify-between px-3 py-1 text-xs cursor-default select-none rounded-sm",
            item.disabled
              ? "text-muted-foreground"
              : "text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          data-testid={`menu-item-${item.id}`}
        >
          <span>{item.label}</span>
          <ChevronRight size={12} className="ms-4 text-muted-foreground" />
        </div>
        {submenuOpen && (
          <div
            className="absolute left-full top-0 ms-0.5 min-w-[180px] bg-card border border-border rounded-md shadow-lg py-1 z-[60]"
            role="menu"
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            {item.submenu.map((sub) => (
              <MenuItemRow key={sub.id} item={sub} onClose={onClose} />
            ))}
          </div>
        )}
        {item.dividerAfter && <div className="my-1 border-t border-border" />}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          "flex items-center justify-between w-full px-3 py-1 text-xs cursor-default select-none rounded-sm text-start",
          item.disabled
            ? "text-muted-foreground pointer-events-none"
            : "text-foreground hover:bg-accent hover:text-accent-foreground",
        )}
        disabled={item.disabled}
        onClick={() => {
          item.action?.();
          onClose();
        }}
        data-testid={`menu-item-${item.id}`}
      >
        <span className="flex items-center gap-2">
          {item.checked !== undefined && (
            <span className="w-3.5">{item.checked && <Check size={12} />}</span>
          )}
          {item.label}
        </span>
        {item.shortcut && (
          <span className="ms-6 text-[10px] text-muted-foreground">{item.shortcut}</span>
        )}
      </button>
      {item.dividerAfter && <div className="my-1 border-t border-border" />}
    </>
  );
}

export function EditorMenuBar(props: MenuBarCallbacks) {
  const { t } = useTranslation();
  const menus = useMenuDefinitions(props);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpenMenu(null), []);
  const navigate = useNavigate();

  useEffect(() => {
    if (!openMenu) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [openMenu, close]);

  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        close();
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [openMenu, close]);

  return (
    <div
      ref={barRef}
      className="flex items-center h-8 bg-background border-b border-border select-none shrink-0"
      data-testid="editor-menu-bar"
    >
      <button
        type="button"
        onClick={() => navigate("/")}
        className="flex items-center gap-1.5 px-2.5 h-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-r border-border"
        title={t.editor.menuBar.backTitle}
      >
        <ArrowLeft size={14} />
      </button>
      <div className="flex items-center px-1">
        {menus.map((menu) => (
          <div key={menu.testId} className="relative">
            <button
              type="button"
              className={cn(
                "px-2.5 h-8 text-xs transition-colors",
                openMenu === menu.testId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
              data-testid={`menu-${menu.testId}`}
              onClick={() => setOpenMenu(openMenu === menu.testId ? null : menu.testId)}
              onMouseEnter={() => {
                if (openMenu) setOpenMenu(menu.testId);
              }}
            >
              {menu.label}
            </button>
            {openMenu === menu.testId && (
              <div
                className="absolute left-0 top-full min-w-[220px] bg-card border border-border rounded-md shadow-lg py-1 z-50"
                data-testid={`menu-dropdown-${menu.testId}`}
                role="menu"
              >
                {menu.items.map((item) => (
                  <MenuItemRow key={item.id} item={item} onClose={close} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
