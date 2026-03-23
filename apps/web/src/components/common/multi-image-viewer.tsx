import { useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageViewer } from "@/components/common/image-viewer";
import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { useFileStore } from "@/stores/file-store";

export function MultiImageViewer() {
  const { entries, selectedIndex, setSelectedIndex, navigateNext, navigatePrev } = useFileStore();
  const currentEntry = entries[selectedIndex];
  if (!currentEntry) return null;

  const hasMultiple = entries.length > 1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < entries.length - 1;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); navigatePrev(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); navigateNext(); }
  }, [navigateNext, navigatePrev]);

  const hasProcessed = !!currentEntry.processedUrl;

  return (
    <div className="flex flex-col w-full h-full" onKeyDown={hasMultiple ? handleKeyDown : undefined} tabIndex={hasMultiple ? 0 : undefined}>
      <div className="flex-1 relative flex items-center justify-center">
        {hasMultiple && hasPrev && (
          <button onClick={navigatePrev} className="absolute left-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors" aria-label="Previous image">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="w-full h-full">
          {hasProcessed ? (
            <BeforeAfterSlider beforeSrc={currentEntry.blobUrl} afterSrc={currentEntry.processedUrl!} beforeSize={currentEntry.originalSize} afterSize={currentEntry.processedSize ?? undefined} />
          ) : (
            <ImageViewer src={currentEntry.blobUrl} filename={currentEntry.file.name} fileSize={currentEntry.file.size} />
          )}
        </div>
        {hasMultiple && hasNext && (
          <button onClick={navigateNext} className="absolute right-3 z-10 w-8 h-8 rounded-full bg-background/80 border border-border shadow-sm flex items-center justify-center hover:bg-background transition-colors" aria-label="Next image">
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
    </div>
  );
}
