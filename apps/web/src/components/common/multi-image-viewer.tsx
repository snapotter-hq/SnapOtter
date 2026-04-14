import { CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { ImageViewer } from "@/components/common/image-viewer";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { useFileStore } from "@/stores/file-store";

const BROWSER_PREVIEWABLE_EXTS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

function canBrowserPreview(url: string): boolean {
  const ext = decodeURIComponent(url).split(".").pop()?.toLowerCase() ?? "";
  return BROWSER_PREVIEWABLE_EXTS.has(ext);
}

export function MultiImageViewer() {
  const { entries, selectedIndex, setSelectedIndex, navigateNext, navigatePrev } = useFileStore();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateNext();
      }
    },
    [navigateNext, navigatePrev],
  );

  const currentEntry = entries[selectedIndex];
  if (!currentEntry) return null;

  const hasMultiple = entries.length > 1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < entries.length - 1;

  const hasProcessed = !!currentEntry.processedUrl;
  const isPreviewable =
    hasProcessed && currentEntry.processedUrl
      ? canBrowserPreview(currentEntry.processedUrl)
      : false;
  const displayUrl = currentEntry.processedPreviewUrl ?? currentEntry.processedUrl;

  const processedFilename = currentEntry.processedUrl
    ? decodeURIComponent(currentEntry.processedUrl.split("/").pop() ?? "processed")
    : "processed";
  const processedExt = processedFilename.split(".").pop()?.toUpperCase() || "FILE";

  return (
    <section
      aria-label="Image viewer"
      className="flex flex-col w-full h-full min-h-0"
      onKeyDown={hasMultiple ? handleKeyDown : undefined}
      tabIndex={hasMultiple ? 0 : undefined}
    >
      <div className="flex-1 relative flex items-center justify-center min-h-0">
        {hasMultiple && hasPrev && (
          <button
            type="button"
            onClick={navigatePrev}
            className="absolute left-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="w-full h-full min-h-0">
          {hasProcessed && !isPreviewable && !currentEntry.processedPreviewUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium">{processedFilename}</p>
              <p className="text-xs text-muted-foreground">
                {processedExt} files cannot be previewed in the browser.
              </p>
            </div>
          ) : hasProcessed ? (
            <BeforeAfterSlider
              beforeSrc={currentEntry.blobUrl}
              afterSrc={displayUrl ?? ""}
              beforeSize={currentEntry.originalSize}
              afterSize={currentEntry.processedSize ?? undefined}
            />
          ) : currentEntry.previewLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Generating preview...</p>
            </div>
          ) : (
            <ImageViewer
              src={currentEntry.blobUrl}
              filename={currentEntry.file.name}
              fileSize={currentEntry.file.size}
            />
          )}
        </div>
        {hasMultiple && hasNext && (
          <button
            type="button"
            onClick={navigateNext}
            className="absolute right-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {hasMultiple && (
          <div className="absolute top-3 right-3 z-10 bg-background/80 border border-border px-2 py-0.5 rounded-full text-xs text-muted-foreground tabular-nums">
            {selectedIndex + 1} / {entries.length}
          </div>
        )}
      </div>
      <ThumbnailStrip entries={entries} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />
    </section>
  );
}
