// apps/web/src/components/editor/common/welcome-screen.tsx

import { FilePlus, ImagePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/i18n-context";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { format } from "@/lib/format";
import { useEditorStore } from "@/stores/editor-store";
import { NewDocumentDialog } from "./new-document-dialog";

const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.svg,.avif,.svgz,.psd,.tga,.exr,.hdr";

interface WelcomeScreenProps {
  onOpenFile?: (file: File) => void | Promise<void>;
  onNewDocument?: () => void;
}

export function WelcomeScreen({ onOpenFile, onNewDocument }: WelcomeScreenProps = {}) {
  const { t } = useTranslation();
  const sourceImageFailed = useRef(t.editor.ui.captureFailure.sourceImageFailed);
  sourceImageFailed.current = t.editor.ui.captureFailure.sourceImageFailed;
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const loadImage = useEditorStore((s) => s.loadImage);
  const openRunRef = useRef(0);

  useEffect(
    () => () => {
      openRunRef.current += 1;
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File) => {
      if (onOpenFile) {
        await onOpenFile(file);
        return;
      }
      const runId = ++openRunRef.current;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (openRunRef.current !== runId) {
          URL.revokeObjectURL(url);
          return;
        }
        loadImage(url, img.naturalWidth, img.naturalHeight);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (openRunRef.current !== runId) return;
        toast.error(sourceImageFailed.current, { id: "editor-source-image-failed" });
      };
      img.src = url;
    },
    [loadImage, onOpenFile],
  );

  const handleOpenFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_TYPES;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await handleFile(file);
    };
    input.click();
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  return (
    <>
      <section
        aria-label={t.a11y.imageDropZone}
        className="absolute inset-0 flex items-center justify-center z-10"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div
          className={`flex flex-col items-center gap-6 p-12 bg-card border-2 border-dashed rounded-xl max-w-md transition-colors ${
            isDragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center justify-center gap-2">
              {t.editor.welcome.heading}
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-primary/15 text-primary-ink">
                {t.editor.ui.betaBadge}
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">{t.editor.welcome.dropDescription}</p>
          </div>

          <div className="flex flex-col gap-2 w-full">
            <button
              type="button"
              onClick={handleOpenFile}
              className="flex items-center gap-3 w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <ImagePlus size={20} />
              <span className="text-sm font-medium">{t.editor.welcome.openImageButton}</span>
            </button>

            <button
              type="button"
              onClick={() => (onNewDocument ? onNewDocument() : setShowNewDoc(true))}
              className="flex items-center gap-3 w-full px-4 py-3 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
            >
              <FilePlus size={20} />
              <span className="text-sm font-medium">{t.editor.welcome.newDocumentButton}</span>
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {/* The system paste event, not a react-hotkeys-hook binding, so the OS
              picks the modifier: formatShortcut's default rule. */}
            {format(t.editor.welcome.pasteHint, { shortcut: formatShortcut("mod+v") })}
          </p>
        </div>
      </section>

      {!onNewDocument && (
        <NewDocumentDialog open={showNewDoc} onClose={() => setShowNewDoc(false)} />
      )}
    </>
  );
}
