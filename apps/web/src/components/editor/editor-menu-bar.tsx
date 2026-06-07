// apps/web/src/components/editor/editor-menu-bar.tsx

import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editor-store";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

function mod(label: string): string {
  return IS_MAC ? label.replace("Ctrl+", "⌘").replace("Shift+", "⇧") : label;
}

export interface MenuBarCallbacks {
  onNewDocument: () => void;
  onOpenImage: () => void;
  onExport: () => void;
  onSave: () => void;
  onCanvasResize: () => void;
  onImageResize: () => void;
}

interface MenuItem {
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
      label: "File",
      testId: "file",
      items: [
        { label: "New", shortcut: mod("Ctrl+N"), action: callbacks.onNewDocument },
        { label: "Open", shortcut: mod("Ctrl+O"), action: callbacks.onOpenImage },
        { label: "Save", shortcut: mod("Ctrl+S"), action: callbacks.onSave, dividerAfter: true },
        { label: "Export As...", shortcut: mod("Ctrl+Shift+E"), action: callbacks.onExport },
        { label: "Quick Export as PNG", shortcut: mod("Ctrl+Shift+P"), action: callbacks.onExport },
        {
          label: "Close",
          shortcut: mod("Ctrl+W"),
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
      label: "Edit",
      testId: "edit",
      items: [
        { label: "Undo", shortcut: mod("Ctrl+Z"), action: undo },
        { label: "Redo", shortcut: mod("Ctrl+Shift+Z"), action: redo, dividerAfter: true },
        { label: "Cut", shortcut: mod("Ctrl+X"), action: cutObjects },
        { label: "Copy", shortcut: mod("Ctrl+C"), action: copyObjects },
        { label: "Copy Merged", shortcut: mod("Ctrl+Shift+C"), action: copyObjects },
        { label: "Paste", shortcut: mod("Ctrl+V"), action: pasteObjects },
        {
          label: "Paste in Place",
          shortcut: mod("Ctrl+Shift+V"),
          action: pasteInPlace,
          dividerAfter: true,
        },
        {
          label: "Delete",
          shortcut: "Del",
          action: () => removeObjects(selectedObjectIds),
          disabled: selectedObjectIds.length === 0,
        },
        {
          label: "Free Transform",
          shortcut: mod("Ctrl+T"),
          action: () => setTool("transform"),
          dividerAfter: true,
        },
        {
          label: "Transform",
          submenu: [
            { label: "Scale", action: () => setTool("transform") },
            { label: "Rotate", action: () => setTool("transform") },
            { label: "Skew", action: () => setTool("transform") },
            { label: "Flip Horizontal", action: flipCanvasHorizontal },
            { label: "Flip Vertical", action: flipCanvasVertical },
          ],
        },
      ],
    },
    {
      label: "Image",
      testId: "image",
      items: [
        {
          label: "Image Size...",
          shortcut: mod("Ctrl+Alt+I"),
          action: callbacks.onImageResize,
          dividerAfter: true,
        },
        { label: "Canvas Size...", shortcut: mod("Ctrl+Alt+C"), action: callbacks.onCanvasResize },
        {
          label: "Image Rotation",
          submenu: [
            { label: "90° CW", action: () => rotateCanvas(90) },
            { label: "90° CCW", action: () => rotateCanvas(270) },
            { label: "180°", action: () => rotateCanvas(180) },
            { label: "Flip Horizontal", action: flipCanvasHorizontal },
            { label: "Flip Vertical", action: flipCanvasVertical },
          ],
          dividerAfter: true,
        },
        { label: "Trim", action: trimCanvas },
        {
          label: "Adjustments",
          submenu: [
            { label: "Brightness/Contrast" },
            { label: "Hue/Saturation" },
            { label: "Color Balance" },
            { label: "Levels" },
            { label: "Curves" },
          ],
        },
      ],
    },
    {
      label: "Layer",
      testId: "layer",
      items: [
        { label: "New Layer", shortcut: mod("Ctrl+Shift+N"), action: addLayer },
        { label: "Duplicate Layer", action: () => duplicateLayer(activeLayerId) },
        {
          label: "Delete Layer",
          action: () => removeLayer(activeLayerId),
          disabled: singleLayer,
          dividerAfter: true,
        },
        {
          label: "Arrange",
          submenu: [
            {
              label: "Bring to Front",
              action: () => {
                if (selectedObjectIds[0]) bringToFront(selectedObjectIds[0]);
              },
            },
            {
              label: "Bring Forward",
              action: () => {
                if (selectedObjectIds[0]) bringForward(selectedObjectIds[0]);
              },
            },
            {
              label: "Send Backward",
              action: () => {
                if (selectedObjectIds[0]) sendBackward(selectedObjectIds[0]);
              },
            },
            {
              label: "Send to Back",
              action: () => {
                if (selectedObjectIds[0]) sendToBack(selectedObjectIds[0]);
              },
            },
          ],
          dividerAfter: true,
        },
        {
          label: "Merge Down",
          shortcut: mod("Ctrl+E"),
          action: () => mergeDown(activeLayerId),
          disabled: activeIndex <= 0,
        },
        { label: "Flatten Image", action: flattenAll },
      ],
    },
    {
      label: "Select",
      testId: "select",
      items: [
        {
          label: "All",
          shortcut: mod("Ctrl+A"),
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
          label: "Deselect",
          shortcut: mod("Ctrl+D"),
          action: () => setSelection(null),
          dividerAfter: true,
        },
        { label: "Inverse", shortcut: mod("Ctrl+Shift+I"), action: invertSelection },
        { label: "Color Range..." },
      ],
    },
    {
      label: "Filter",
      testId: "filter",
      items: [
        {
          label: "Blur",
          submenu: [
            { label: "Gaussian Blur", action: () => toggleFilter("blur") },
            { label: "Motion Blur", action: () => toggleFilter("motionBlur") },
            { label: "Radial Blur", action: () => toggleFilter("radialBlur") },
            { label: "Surface Blur", action: () => toggleFilter("surfaceBlur") },
          ],
        },
        {
          label: "Sharpen",
          submenu: [
            { label: "Sharpen", action: () => toggleFilter("sharpen") },
            { label: "Unsharp Mask" },
          ],
        },
        {
          label: "Noise",
          submenu: [
            { label: "Add Noise", action: () => toggleFilter("noise") },
            { label: "Reduce Noise" },
          ],
        },
        {
          label: "Pixelate",
          submenu: [
            { label: "Pixelate", action: () => toggleFilter("pixelate") },
            { label: "Mosaic" },
          ],
        },
        {
          label: "Stylize",
          submenu: [
            { label: "Emboss", action: () => toggleFilter("emboss") },
            { label: "Solarize", action: () => toggleFilter("solarize") },
            { label: "Posterize", action: () => toggleFilter("posterize") },
          ],
          dividerAfter: true,
        },
        { label: "Grayscale", action: () => toggleFilter("grayscale") },
        { label: "Sepia", action: () => toggleFilter("sepia") },
        { label: "Invert", action: () => toggleFilter("invert") },
      ],
    },
    {
      label: "View",
      testId: "view",
      items: [
        { label: "Zoom In", shortcut: mod("Ctrl+="), action: () => setZoom(zoom * 1.25) },
        { label: "Zoom Out", shortcut: mod("Ctrl+-"), action: () => setZoom(zoom / 1.25) },
        {
          label: "Fit on Screen",
          shortcut: mod("Ctrl+0"),
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
          label: "Actual Pixels",
          shortcut: mod("Ctrl+1"),
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
        { label: "Rulers", checked: rulersVisible, action: toggleRulers },
        { label: "Grid", checked: gridVisible, action: toggleGrid },
        { label: "Guides", checked: guidesVisible, action: toggleGuides },
        { label: "Snap", checked: snappingEnabled, action: toggleSnapping, dividerAfter: true },
        { label: "Panels", checked: rightPanelVisible, action: toggleRightPanel },
      ],
    },
  ];
}

function toTestId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
          data-testid={`menu-item-${toTestId(item.label)}`}
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
              <MenuItemRow key={sub.label} item={sub} onClose={onClose} />
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
        data-testid={`menu-item-${toTestId(item.label)}`}
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
        title="Back to SnapOtter"
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
                  <MenuItemRow key={item.label} item={item} onClose={close} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
