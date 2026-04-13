import { Check, Download, FileOutput, Loader2 } from "lucide-react";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";

const PREVIEWABLE_FORMATS = new Set(["png", "jpg", "webp", "gif", "avif"]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfToImagePreview() {
  const store = usePdfToImageStore();

  // No file uploaded
  if (!store.file) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-3 text-center">
        <FileOutput className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Upload a PDF to get started</p>
      </div>
    );
  }

  // Loading preview thumbnails
  if (store.loadingPreview) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-3">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">Generating page previews...</p>
      </div>
    );
  }

  // Converting - show thumbnails with progress overlay
  if (store.processing) {
    return (
      <div className="h-full w-full overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-3">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">
            Converting {store.selectedPages.size} page
            {store.selectedPages.size !== 1 ? "s" : ""}...
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {store.thumbnails.map((thumb) => {
            const isSelected = store.selectedPages.has(thumb.page);
            return (
              <div
                key={thumb.page}
                className={`relative rounded-lg border overflow-hidden ${
                  isSelected ? "border-primary/50 opacity-100" : "border-border opacity-30"
                }`}
              >
                <img src={thumb.dataUrl} alt={`Page ${thumb.page}`} className="w-full h-auto" />
                {isSelected && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  </div>
                )}
                <div className="absolute top-1.5 left-1.5 bg-background/80 backdrop-blur-sm border border-border px-1.5 py-0.5 rounded text-xs text-muted-foreground tabular-nums">
                  {thumb.page}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Results ready - show converted images
  if (store.results && store.results.length > 0) {
    const isPreviewable = PREVIEWABLE_FORMATS.has(store.format);
    const totalSize = store.results.reduce((sum, r) => sum + (r.size ?? 0), 0);

    return (
      <div className="h-full w-full overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-foreground">
            {store.results.length} page
            {store.results.length !== 1 ? "s" : ""} converted
            {totalSize > 0 && (
              <span className="text-muted-foreground font-normal ml-1">
                ({formatSize(totalSize)})
              </span>
            )}
          </p>
          <span className="text-xs text-muted-foreground uppercase font-mono">{store.format}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {store.results.map((result) => {
            const thumb = store.thumbnails.find((t) => t.page === result.page);

            return (
              <div
                key={result.page}
                className="group relative rounded-lg border border-border overflow-hidden bg-muted/30"
              >
                {isPreviewable ? (
                  <img
                    src={result.downloadUrl}
                    alt={`Page ${result.page}`}
                    className="w-full h-auto"
                    loading="lazy"
                  />
                ) : thumb?.dataUrl ? (
                  <img src={thumb.dataUrl} alt={`Page ${result.page}`} className="w-full h-auto" />
                ) : (
                  <div className="w-full aspect-[3/4] flex flex-col items-center justify-center gap-1">
                    <FileOutput className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}

                {/* Page number badge */}
                <div className="absolute top-1.5 left-1.5 bg-background/80 backdrop-blur-sm border border-border px-1.5 py-0.5 rounded text-xs text-muted-foreground tabular-nums">
                  {result.page}
                </div>

                {/* Format badge */}
                <div className="absolute top-1.5 right-1.5 bg-background/80 backdrop-blur-sm border border-border px-1.5 py-0.5 rounded text-xs text-muted-foreground uppercase font-mono">
                  {store.format}
                </div>

                {/* File size badge */}
                {result.size > 0 && (
                  <div className="absolute bottom-1.5 right-1.5 bg-background/80 backdrop-blur-sm border border-border px-1.5 py-0.5 rounded text-xs text-muted-foreground tabular-nums">
                    {formatSize(result.size)}
                  </div>
                )}

                {/* Download overlay */}
                <a
                  href={result.downloadUrl}
                  download={`page-${result.page}.${store.format}`}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
                >
                  <Download className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Thumbnails loaded - show selectable page previews
  if (store.thumbnails.length > 0) {
    const allSelected = store.pageCount !== null && store.selectedPages.size === store.pageCount;
    const noneSelected = store.selectedPages.size === 0;

    return (
      <div className="h-full w-full overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">
            {store.selectedPages.size} of {store.pageCount} page
            {store.pageCount !== 1 ? "s" : ""} selected
          </p>
          <div className="flex gap-2">
            {!allSelected && (
              <button
                type="button"
                onClick={() => store.selectAllPages()}
                className="text-xs text-primary hover:underline"
              >
                Select All
              </button>
            )}
            {!noneSelected && (
              <button
                type="button"
                onClick={() => store.deselectAllPages()}
                className="text-xs text-primary hover:underline"
              >
                Deselect All
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {store.thumbnails.map((thumb) => {
            const isSelected = store.selectedPages.has(thumb.page);
            return (
              <button
                key={thumb.page}
                type="button"
                onClick={() => store.togglePage(thumb.page)}
                className={`relative rounded-lg border overflow-hidden text-left transition-all ${
                  isSelected
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border opacity-50 hover:opacity-75"
                }`}
              >
                <img src={thumb.dataUrl} alt={`Page ${thumb.page}`} className="w-full h-auto" />

                {/* Page number badge */}
                <div className="absolute top-1.5 left-1.5 bg-background/80 backdrop-blur-sm border border-border px-1.5 py-0.5 rounded text-xs text-muted-foreground tabular-nums">
                  {thumb.page}
                </div>

                {/* Selection checkbox */}
                <div
                  className={`absolute top-1.5 right-1.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    isSelected ? "bg-primary border-primary" : "bg-background/80 border-border"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-3 text-center">
      <FileOutput className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">Upload a PDF to get started</p>
    </div>
  );
}
