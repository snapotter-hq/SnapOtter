import { ArrowLeft, ChevronLeft, ChevronRight, Crown, Search } from "lucide-react";
import { formatFileSize } from "@/lib/download";
import type { DuplicateFileInfo } from "@/stores/duplicate-store";
import { useDuplicateStore } from "@/stores/duplicate-store";

function getBestIndex(
  files: DuplicateFileInfo[],
  groupIndex: number,
  overrides: Record<number, number>,
): number {
  if (groupIndex in overrides) return overrides[groupIndex];
  return files.findIndex((f) => f.isBest);
}

function OverviewGrid() {
  const { results, setSelectedGroup } = useDuplicateStore();
  if (!results) return null;

  return (
    <div className="w-full h-full overflow-y-auto p-4 space-y-3">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 px-4 py-3 bg-muted rounded-lg text-xs items-center">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Scanned:</span>
          <span className="text-foreground font-semibold">{results.totalImages}</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Duplicate groups:</span>
          <span className="text-yellow-500 font-semibold">{results.duplicateGroups.length}</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Unique:</span>
          <span className="text-green-500 font-semibold">{results.uniqueImages}</span>
        </div>
        {results.spaceSaveable > 0 && (
          <>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Space saveable:</span>
              <span className="text-primary font-semibold">
                {formatFileSize(results.spaceSaveable)}
              </span>
            </div>
          </>
        )}
      </div>

      {results.duplicateGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Search className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-sm font-medium text-foreground">No duplicates found</p>
          <p className="text-xs text-muted-foreground">
            All {results.totalImages} images are unique.
          </p>
        </div>
      ) : (
        results.duplicateGroups.map((group, gi) => (
          <button
            key={group.groupId}
            type="button"
            onClick={() => setSelectedGroup(gi)}
            className="w-full text-left p-3 rounded-lg bg-muted/50 border border-border hover:border-primary/50 transition-colors"
          >
            <div className="flex justify-between items-center mb-2.5">
              <div className="flex items-center gap-2">
                <span className="bg-yellow-500 text-yellow-950 text-[10px] px-2 py-0.5 rounded font-bold">
                  GROUP {group.groupId}
                </span>
                <span className="text-xs font-medium text-foreground">
                  {Math.max(...group.files.map((f) => f.similarity))}% Similar
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {group.files.length} images &middot; Click to compare &rsaquo;
              </span>
            </div>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {group.files.map((file) => (
                <div key={file.filename} className="shrink-0 w-[140px]">
                  <div
                    className={`relative rounded-md h-[90px] bg-background border-2 overflow-hidden flex items-center justify-center ${
                      file.isBest ? "border-green-500" : "border-transparent"
                    }`}
                  >
                    {file.thumbnail ? (
                      <img
                        src={file.thumbnail}
                        alt={file.filename}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">No preview</span>
                    )}
                    {file.isBest && (
                      <span className="absolute top-1 left-1 bg-green-500 text-green-950 text-[9px] px-1.5 py-0.5 rounded font-bold">
                        BEST
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <p className="text-[11px] text-foreground truncate">{file.filename}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {file.width}x{file.height} &middot; {formatFileSize(file.fileSize)} &middot;{" "}
                      {file.format.toUpperCase()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function DetailComparison() {
  const {
    results,
    selectedGroupIndex,
    bestOverrides,
    setViewMode,
    setSelectedGroup,
    overrideBest,
  } = useDuplicateStore();
  if (!results || results.duplicateGroups.length === 0) return null;

  const group = results.duplicateGroups[selectedGroupIndex];
  const totalGroups = results.duplicateGroups.length;
  const bestIdx = getBestIndex(group.files, selectedGroupIndex, bestOverrides);

  const goPrev = () => {
    if (selectedGroupIndex > 0) setSelectedGroup(selectedGroupIndex - 1);
  };
  const goNext = () => {
    if (selectedGroupIndex < totalGroups - 1) setSelectedGroup(selectedGroupIndex + 1);
  };

  return (
    <div className="w-full h-full overflow-y-auto p-4 space-y-3">
      {/* Navigation bar */}
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={() => setViewMode("overview")}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Overview
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={selectedGroupIndex === 0}
            className="p-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-foreground">
            Group {selectedGroupIndex + 1} of {totalGroups}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={selectedGroupIndex === totalGroups - 1}
            className="p-1 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-xs font-medium text-yellow-500">
          {Math.max(...group.files.map((f) => f.similarity))}% Similar
        </span>
      </div>

      {/* Large side-by-side images */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(group.files.length, 3)}, 1fr)` }}
      >
        {group.files.map((file, fi) => {
          const isCurrentBest = fi === bestIdx;
          return (
            <button
              key={file.filename}
              type="button"
              onClick={() => overrideBest(selectedGroupIndex, fi)}
              className="text-left"
              title={isCurrentBest ? "Selected as best" : "Click to mark as best"}
            >
              <div
                className={`rounded-lg overflow-hidden border-2 bg-background aspect-[4/3] flex items-center justify-center relative ${
                  isCurrentBest ? "border-green-500" : "border-border hover:border-primary/50"
                }`}
              >
                {file.thumbnail ? (
                  <img
                    src={file.thumbnail}
                    alt={file.filename}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-sm text-muted-foreground">No preview</span>
                )}
                {isCurrentBest && (
                  <span className="absolute top-2 left-2 bg-green-500 text-green-950 text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1">
                    <Crown className="h-3 w-3" />
                    BEST
                  </span>
                )}
              </div>
              {/* Metadata card */}
              <div className="mt-2 p-2.5 rounded-lg bg-muted border border-border text-xs space-y-1.5">
                <p className="font-medium text-foreground truncate">{file.filename}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Dimensions</span>
                  <span className="text-foreground text-right">
                    {file.width} x {file.height}
                  </span>
                  <span className="text-muted-foreground">File size</span>
                  <span className="text-foreground text-right">
                    {formatFileSize(file.fileSize)}
                  </span>
                  <span className="text-muted-foreground">Format</span>
                  <span className="text-foreground text-right">{file.format.toUpperCase()}</span>
                  <span className="text-muted-foreground">Similarity</span>
                  <span
                    className={`text-right font-medium ${file.similarity === 100 ? "text-green-500" : "text-yellow-500"}`}
                  >
                    {file.similarity}%
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {group.files.length > 3 && (
        <p className="text-[10px] text-muted-foreground text-center">
          Showing all {group.files.length} images in this group. Click any image to set it as
          "best."
        </p>
      )}
    </div>
  );
}

export function FindDuplicatesResults() {
  const { results, scanning, viewMode } = useDuplicateStore();

  if (scanning) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Scanning for duplicates...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
        <Search className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Choose a detection mode and click "Scan" to find duplicates.
        </p>
      </div>
    );
  }

  return viewMode === "detail" ? <DetailComparison /> : <OverviewGrid />;
}
