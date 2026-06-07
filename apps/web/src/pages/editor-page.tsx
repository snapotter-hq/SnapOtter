// apps/web/src/pages/editor-page.tsx
import { Monitor } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CanvasResizeDialog } from "@/components/editor/common/canvas-resize-dialog";
import {
  AutosaveRecoveryBanner,
  ExportDialog,
  saveEditorState,
  useAutosave,
} from "@/components/editor/common/export-dialog";
import { FillDialog } from "@/components/editor/common/fill-dialog";
import { ImageResizeDialog } from "@/components/editor/common/image-resize-dialog";
import { NewDocumentDialog } from "@/components/editor/common/new-document-dialog";
import { HorizontalRuler, VerticalRuler } from "@/components/editor/common/rulers";
import { WelcomeScreen } from "@/components/editor/common/welcome-screen";
import { EditorCanvas } from "@/components/editor/editor-canvas";
import { EditorMenuBar } from "@/components/editor/editor-menu-bar";
import { EditorOptionsBar } from "@/components/editor/editor-options-bar";
import { EditorRightPanel } from "@/components/editor/editor-right-panel";
import { EditorStatusBar } from "@/components/editor/editor-status-bar";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { useTranslation } from "@/contexts/i18n-context";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { useMobile } from "@/hooks/use-mobile";
import { useEditorStore } from "@/stores/editor-store";

const SERVER_DECODED_EXTS = new Set(["psd", "tga", "exr", "hdr"]);

export function EditorPage() {
  const { t } = useTranslation();
  const isMobile = useMobile();
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);
  const isDirty = useEditorStore((s) => s.isDirty);
  const loadImage = useEditorStore((s) => s.loadImage);
  const rulersVisible = useEditorStore((s) => s.rulersVisible);
  const [showExport, setShowExport] = useState(false);
  const [showCanvasResize, setShowCanvasResize] = useState(false);
  const [showImageResize, setShowImageResize] = useState(false);
  const [fillDialogOpen, setFillDialogOpen] = useState(false);
  const [showNewDocument, setShowNewDocument] = useState(false);

  // Autosave recovery
  const { recoveryData, dismissRecovery, restoreRecovery } = useAutosave();

  // Issue #10: Shortcuts belong at page level, not canvas level
  useEditorShortcuts({
    onSave: () => saveEditorState(),
    onExport: () => setShowExport(true),
    onFillDialog: () => setFillDialogOpen(true),
  });

  // Listen for fill-dialog custom event (dispatched from Shift+Backspace shortcut)
  useEffect(() => {
    const handler = () => setFillDialogOpen(true);
    window.addEventListener("snapotter:open-fill-dialog", handler);
    return () => window.removeEventListener("snapotter:open-fill-dialog", handler);
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => loadImage(url, img.naturalWidth, img.naturalHeight);
          img.src = url;
          return;
        }
      }
    },
    [loadImage],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleOpenImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.avif,.psd,.tga,.exr,.hdr";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (SERVER_DECODED_EXTS.has(ext)) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("settings", JSON.stringify({ format: "png" }));
          const res = await fetch("/api/v1/tools/convert", { method: "POST", body: formData });
          if (!res.ok) throw new Error("Server decode failed");
          const json = await res.json();
          if (json.downloadUrl) {
            const imgRes = await fetch(json.downloadUrl);
            const blob = await imgRes.blob();
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => loadImage(url, img.naturalWidth, img.naturalHeight);
            img.src = url;
          }
        } catch (err) {
          console.error("Failed to decode file via server:", err);
        }
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => loadImage(url, img.naturalWidth, img.naturalHeight);
      img.src = url;
    };
    input.click();
  }, [loadImage]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (url) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => loadImage(url, img.naturalWidth, img.naturalHeight);
      img.src = url;
    }
  }, [loadImage]);

  if (isMobile) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <Monitor size={48} className="text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">{t.editor.mobile.heading}</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{t.editor.mobile.description}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
      <h1 className="sr-only">{t.editor.welcome.heading}</h1>
      <EditorMenuBar
        onNewDocument={() => setShowNewDocument(true)}
        onOpenImage={handleOpenImage}
        onExport={() => setShowExport(true)}
        onSave={() => saveEditorState()}
        onCanvasResize={() => setShowCanvasResize(true)}
        onImageResize={() => setShowImageResize(true)}
      />
      {/* Autosave recovery banner */}
      {recoveryData && (
        <AutosaveRecoveryBanner
          data={recoveryData}
          onRestore={restoreRecovery}
          onDiscard={dismissRecovery}
        />
      )}
      <EditorOptionsBar />
      {/* Horizontal ruler along the top edge */}
      {rulersVisible && <HorizontalRuler />}
      <div className="flex flex-1 overflow-hidden">
        <EditorToolbar />
        {/* Vertical ruler along the left edge */}
        {rulersVisible && <VerticalRuler />}
        <div className="relative flex-1 overflow-hidden bg-muted/30">
          <EditorCanvas
            onCanvasResize={() => setShowCanvasResize(true)}
            onImageResize={() => setShowImageResize(true)}
          />
          {!sourceImageUrl && <WelcomeScreen />}
        </div>
        <EditorRightPanel />
      </div>
      <EditorStatusBar />
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      <CanvasResizeDialog open={showCanvasResize} onClose={() => setShowCanvasResize(false)} />
      <ImageResizeDialog open={showImageResize} onClose={() => setShowImageResize(false)} />
      <FillDialog open={fillDialogOpen} onClose={() => setFillDialogOpen(false)} />
      <NewDocumentDialog open={showNewDocument} onClose={() => setShowNewDocument(false)} />
    </div>
  );
}
