// apps/web/src/components/editor/common/welcome-screen.tsx

import { FilePlus, ImagePlus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useEditorStore } from "@/stores/editor-store";
import { NewDocumentDialog } from "./new-document-dialog";

const ACCEPTED_TYPES = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.tiff,.svg,.avif,.svgz";

export function WelcomeScreen() {
  const { t } = useTranslation();
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const loadImage = useEditorStore((s) => s.loadImage);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        loadImage(url, img.naturalWidth, img.naturalHeight);
      };
      img.src = url;
    },
    [loadImage],
  );

  const handleOpenFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_TYPES;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
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
            <h2 className="text-xl font-semibold text-foreground mb-1">
              {t.editor.welcome.heading}
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
              onClick={() => setShowNewDoc(true)}
              className="flex items-center gap-3 w-full px-4 py-3 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
            >
              <FilePlus size={20} />
              <span className="text-sm font-medium">{t.editor.welcome.newDocumentButton}</span>
            </button>
          </div>

          <p className="text-xs text-muted-foreground">{t.editor.welcome.pasteHint}</p>
        </div>
      </section>

      <NewDocumentDialog open={showNewDoc} onClose={() => setShowNewDoc(false)} />
    </>
  );
}
