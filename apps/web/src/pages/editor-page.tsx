// apps/web/src/pages/editor-page.tsx
import { ANALYTICS_EVENTS, apiToolPath, SafeError } from "@snapotter/shared";
import { Monitor } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CanvasResizeDialog } from "@/components/editor/common/canvas-resize-dialog";
import {
  AutosaveRecoveryBanner,
  ExportDialog,
  saveEditorState,
  subscribeExportJobProgress,
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
import { usePageTitle } from "@/hooks/use-page-title";
import { captureHandledError } from "@/lib/analytics";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { withAnalytics } from "@/lib/lazy-analytics";
import {
  checkToolResult,
  jobFailureMessage,
  MalformedResultError,
  reportMalformedResult,
} from "@/lib/progress-frames";
import { cancelPendingRebakes, useEditorStore } from "@/stores/editor-store";

const SERVER_DECODED_EXTS = new Set(["psd", "tga", "exr", "hdr"]);
const EDITOR_OPEN_TOOL_ID = "editor-open";

function isDocumentReplacementAction(action: { id: string }): boolean {
  return (
    action.id === "loadImage" || action.id === "loadProject" || action.id === "restoreAutosave"
  );
}

export function EditorPage() {
  const { t } = useTranslation();
  // Read at failure time: the ?url= effect below must not re-run on a locale change.
  const sourceImageFailed = useRef(t.editor.ui.captureFailure.sourceImageFailed);
  sourceImageFailed.current = t.editor.ui.captureFailure.sourceImageFailed;
  usePageTitle(t.sidebar.editor);
  const isMobile = useMobile();
  const sourceImageUrl = useEditorStore((s) => s.sourceImageUrl);
  const loadImage = useEditorStore((s) => s.loadImage);
  const rulersVisible = useEditorStore((s) => s.rulersVisible);
  const [showExport, setShowExport] = useState(false);
  const [showCanvasResize, setShowCanvasResize] = useState(false);
  const [showImageResize, setShowImageResize] = useState(false);
  const [fillDialogOpen, setFillDialogOpen] = useState(false);
  const [showNewDocument, setShowNewDocument] = useState(false);
  const isModalOpen =
    showExport || showCanvasResize || showImageResize || fillDialogOpen || showNewDocument;
  const stopOpenRef = useRef<() => void>(() => {});
  const openRunRef = useRef(0);

  const closeDocumentModals = useCallback(() => {
    setShowExport(false);
    setShowCanvasResize(false);
    setShowImageResize(false);
    setFillDialogOpen(false);
    setShowNewDocument(false);
  }, []);

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (
        state._historyVersion !== prev._historyVersion ||
        state.sourceImageUrl !== prev.sourceImageUrl
      ) {
        openRunRef.current += 1;
        stopOpenRef.current();
        stopOpenRef.current = () => {};
      }
      if (
        (state.sourceImageUrl === null && prev.sourceImageUrl !== null) ||
        (state.lastAction !== prev.lastAction &&
          ((state._historyVersion > prev._historyVersion &&
            isDocumentReplacementAction(state.lastAction)) ||
            (state._historyVersion < prev._historyVersion &&
              isDocumentReplacementAction(prev.lastAction))))
      ) {
        closeDocumentModals();
      }
    });
    return () => {
      unsubscribe();
      openRunRef.current += 1;
      stopOpenRef.current();
    };
  }, [closeDocumentModals]);

  // Autosave recovery
  const { recoveryData, dismissRecovery, restoreRecovery } = useAutosave();

  const handleManualSave = useCallback(() => {
    if (useEditorStore.getState().rebaking) return;
    void saveEditorState({
      manual: true,
      errorMessage: t.editor.ui.autosaveRecovery.saveFailed,
    });
  }, [t.editor.ui.autosaveRecovery.saveFailed]);

  const handleOpenExport = useCallback(() => {
    if (useEditorStore.getState().rebaking) return;
    setShowExport(true);
  }, []);

  // Issue #10: Shortcuts belong at page level, not canvas level
  useEditorShortcuts({
    onSave: handleManualSave,
    onExport: handleOpenExport,
    onFillDialog: () => setFillDialogOpen(true),
    disabled: isModalOpen,
  });

  useEffect(() => {
    withAnalytics(({ track }) => track(ANALYTICS_EVENTS.EDITOR_OPENED, {}));
  }, []);

  // Listen for fill-dialog custom event (dispatched from Shift+Backspace shortcut)
  useEffect(() => {
    const handler = () => {
      if (isModalOpen) return;
      setFillDialogOpen(true);
    };
    window.addEventListener("snapotter:open-fill-dialog", handler);
    return () => window.removeEventListener("snapotter:open-fill-dialog", handler);
  }, [isModalOpen]);

  const loadBlobImage = useCallback(
    (blob: Blob, runId: number, fromServer = false) => {
      if (openRunRef.current !== runId) return;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (openRunRef.current !== runId) {
          URL.revokeObjectURL(url);
          return;
        }
        closeDocumentModals();
        loadImage(url, img.naturalWidth, img.naturalHeight);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (openRunRef.current !== runId) return;
        toast.error(sourceImageFailed.current, { id: "editor-source-image-failed" });
        if (fromServer) {
          console.error("Failed to decode server-converted image in browser");
          void captureHandledError(
            new SafeError("Editor source image could not be decoded", {
              kind: "operational",
            }),
            { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
          );
        }
      };
      img.src = url;
    },
    [closeDocumentModals, loadImage],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      if (isModalOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) return;
          const runId = ++openRunRef.current;
          stopOpenRef.current();
          stopOpenRef.current = () => {};
          cancelPendingRebakes();
          loadBlobImage(blob, runId);
          return;
        }
      }
    },
    [isModalOpen, loadBlobImage],
  );

  useEffect(() => {
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleOpenFile = useCallback(
    async (file: File) => {
      const runId = ++openRunRef.current;
      stopOpenRef.current();
      cancelPendingRebakes();
      const isCurrent = () => openRunRef.current === runId;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (SERVER_DECODED_EXTS.has(ext)) {
        const controller = new AbortController();
        stopOpenRef.current = () => {
          controller.abort();
        };

        const fetchDecodedImage = async (downloadUrl: string) => {
          let imgRes: Response;
          try {
            imgRes = await fetch(downloadUrl, {
              headers: formatHeaders(),
              signal: controller.signal,
            });
          } catch (err) {
            if (!isCurrent()) return;
            stopOpenRef.current = () => {};
            console.error("Failed to fetch decoded file from server:", err);
            toast.error(sourceImageFailed.current);
            void captureHandledError(
              new SafeError("Editor source image download failed", {
                kind: "operational",
                cause: err,
              }),
              { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
            );
            return;
          }
          if (!isCurrent()) return;
          if (!imgRes.ok) {
            stopOpenRef.current = () => {};
            console.error("Failed to fetch decoded file from server:", imgRes.status);
            toast.error(sourceImageFailed.current);
            void captureHandledError(
              new SafeError("Editor source image download failed", {
                kind: "operational",
                statusCode: imgRes.status,
              }),
              { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
            );
            return;
          }
          let blob: Blob;
          try {
            blob = await imgRes.blob();
          } catch (err) {
            if (!isCurrent()) return;
            stopOpenRef.current = () => {};
            console.error("Failed to read decoded file from server:", err);
            toast.error(sourceImageFailed.current);
            void captureHandledError(
              new SafeError("Editor source image download failed", {
                kind: "operational",
                cause: err,
              }),
              { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
            );
            return;
          }
          if (!isCurrent()) return;
          stopOpenRef.current = () => {};
          if (blob.size === 0) {
            console.error("Server returned an empty decoded image");
            toast.error(sourceImageFailed.current);
            void captureHandledError(
              new SafeError("Editor source image download was empty", {
                kind: "operational",
              }),
              { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
            );
            return;
          }
          loadBlobImage(blob, runId, true);
        };

        const formData = new FormData();
        formData.append("file", file);
        formData.append("settings", JSON.stringify({ format: "png" }));
        let res: Response;
        try {
          res = await fetch(appUrl(apiToolPath("convert")), {
            method: "POST",
            headers: formatHeaders(),
            body: formData,
            signal: controller.signal,
          });
        } catch (err) {
          if (!isCurrent()) return;
          stopOpenRef.current = () => {};
          console.error("Failed to decode file via server:", err);
          toast.error(sourceImageFailed.current);
          void captureHandledError(
            new SafeError("Server-side image decode request failed", {
              kind: "operational",
              cause: err,
            }),
            { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
          );
          return;
        }
        if (!isCurrent()) return;

        if (!res.ok) {
          const body = typeof res.json === "function" ? await res.json().catch(() => null) : null;
          if (!isCurrent()) return;
          stopOpenRef.current = () => {};
          const message = failedAnswerMessage(t, body, res.status, sourceImageFailed.current);
          console.error("Failed to decode file via server:", res.status, body);
          toast.error(message);
          void captureHandledError(
            new SafeError("Server-side image decode failed", {
              kind: "operational",
              statusCode: res.status,
            }),
            { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
          );
          return;
        }

        let rawBody: unknown;
        try {
          rawBody = resolveServerUrls(await res.json());
        } catch (err) {
          if (!isCurrent()) return;
          stopOpenRef.current = () => {};
          console.error("Failed to decode file via server:", err);
          reportMalformedResult(new MalformedResultError("notAnObject"), {
            status: res.status,
            toolId: EDITOR_OPEN_TOOL_ID,
          });
          toast.error(t.errors.invalidResponse);
          return;
        }
        if (!isCurrent()) return;

        const isAsyncAccepted =
          res.status === 202 ||
          (typeof rawBody === "object" &&
            rawBody !== null &&
            !Array.isArray(rawBody) &&
            (rawBody as Record<string, unknown>).async === true);

        if (isAsyncAccepted) {
          const rawJobId = (rawBody as Record<string, unknown> | null)?.jobId;
          const jobId = typeof rawJobId === "string" ? rawJobId.trim() : "";
          if (!jobId) {
            stopOpenRef.current = () => {};
            console.error("Server-side image decode answered 202 without a jobId");
            reportMalformedResult(new MalformedResultError("missingResultField"), {
              status: res.status,
              toolId: EDITOR_OPEN_TOOL_ID,
            });
            toast.error(t.errors.invalidResponse);
            return;
          }
          if (typeof EventSource !== "function") {
            stopOpenRef.current = () => {};
            console.error("Server-side image decode answered before the file was ready");
            toast.error(sourceImageFailed.current);
            void captureHandledError(
              new SafeError("Server-side image decode progress stream unavailable", {
                kind: "operational",
              }),
              { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
            );
            return;
          }
          let failedOnce = false;
          const subscription = subscribeExportJobProgress(
            jobId,
            {
              onComplete: (result) => {
                if (!isCurrent()) return;
                void fetchDecodedImage(result.downloadUrl);
              },
              onFailed: (failure) => {
                if (failedOnce || !isCurrent()) return;
                failedOnce = true;
                stopOpenRef.current = () => {};
                const isTrackingBug = "reason" in failure && failure.reason === "trackingFailed";
                console.error("Failed to decode file via server:", failure);
                toast.error(jobFailureMessage(failure, t.errors));
                if (isTrackingBug) {
                  void captureHandledError(
                    new SafeError("Editor image open failed", { kind: "bug" }),
                    { error_class: "bug", tool_id: EDITOR_OPEN_TOOL_ID },
                  );
                }
              },
              onStall: () => {
                if (!isCurrent()) return;
                stopOpenRef.current = () => {};
                toast.error(t.errors.timeout);
                void captureHandledError(
                  new SafeError("Server-side image decode timed out waiting for job progress", {
                    kind: "operational",
                  }),
                  { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
                );
              },
            },
            EDITOR_OPEN_TOOL_ID,
          );
          if (!subscription.opened) {
            subscription.stop();
            stopOpenRef.current = () => {};
            console.error("Server-side image decode answered before the file was ready");
            toast.error(sourceImageFailed.current);
            void captureHandledError(
              new SafeError("Server-side image decode progress stream unavailable", {
                kind: "operational",
              }),
              { error_class: "operational", tool_id: EDITOR_OPEN_TOOL_ID },
            );
            return;
          }
          stopOpenRef.current = () => {
            controller.abort();
            subscription.stop();
          };
          return;
        }

        let result: { downloadUrl: string };
        try {
          result = checkToolResult<{ downloadUrl: string }>(rawBody);
        } catch (err) {
          stopOpenRef.current = () => {};
          console.error("Server-side image decode returned no download URL");
          reportMalformedResult(err, { status: res.status, toolId: EDITOR_OPEN_TOOL_ID });
          toast.error(t.errors.invalidResponse);
          return;
        }
        await fetchDecodedImage(result.downloadUrl);
        return;
      }
      stopOpenRef.current = () => {};
      loadBlobImage(file, runId);
    },
    [loadBlobImage, t],
  );

  const handleOpenImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.avif,.psd,.tga,.exr,.hdr";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await handleOpenFile(file);
    };
    input.click();
  }, [handleOpenFile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (url) {
      const runId = ++openRunRef.current;
      stopOpenRef.current();
      stopOpenRef.current = () => {};
      cancelPendingRebakes();
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (openRunRef.current !== runId) return;
        closeDocumentModals();
        loadImage(url, img.naturalWidth, img.naturalHeight);
      };
      // Without CORS headers the browser refuses the image outright, and the
      // editor used to stay on the welcome screen without a word.
      img.onerror = () => {
        if (openRunRef.current !== runId) return;
        toast.error(sourceImageFailed.current, { id: "editor-source-image-failed" });
      };
      img.src = url;
    }
  }, [closeDocumentModals, loadImage]);

  if (isMobile) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-col items-center justify-center h-full p-8 text-center"
      >
        <h1 className="sr-only">{t.editor.welcome.heading}</h1>
        <Monitor size={48} className="text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-2">{t.editor.mobile.heading}</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{t.editor.mobile.description}</p>
        {/* A home-screen web app has no browser chrome, so this screen needs
            its own way back or it is a dead end (#735). */}
        <Link
          to="/"
          data-testid="editor-mobile-back"
          className="mt-6 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium"
        >
          {t.toolPage.backToTools}
        </Link>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex flex-col h-dvh overflow-hidden bg-background text-foreground"
    >
      <h1 className="sr-only">{t.editor.welcome.heading}</h1>
      <EditorMenuBar
        onNewDocument={() => setShowNewDocument(true)}
        onOpenImage={handleOpenImage}
        onExport={handleOpenExport}
        onSave={handleManualSave}
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
        {/* `flex` is required so the canvas child's `flex-1` fills this area;
            without it the canvas collapses to the Stage's content height,
            leaving a dead region below (issue #258). */}
        <div className="relative flex flex-1 overflow-hidden bg-muted/30">
          <EditorCanvas
            onCanvasResize={() => setShowCanvasResize(true)}
            onImageResize={() => setShowImageResize(true)}
          />
          {!sourceImageUrl && (
            <WelcomeScreen
              onOpenFile={handleOpenFile}
              onNewDocument={() => setShowNewDocument(true)}
            />
          )}
        </div>
        <EditorRightPanel />
      </div>
      <EditorStatusBar />
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      <CanvasResizeDialog open={showCanvasResize} onClose={() => setShowCanvasResize(false)} />
      <ImageResizeDialog open={showImageResize} onClose={() => setShowImageResize(false)} />
      <FillDialog open={fillDialogOpen} onClose={() => setFillDialogOpen(false)} />
      <NewDocumentDialog open={showNewDocument} onClose={() => setShowNewDocument(false)} />
    </main>
  );
}
