import { Download, Loader2, PackageOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";
import type { SplitMode } from "@/stores/split-store";
import { useSplitStore } from "@/stores/split-store";

const MODES: Array<{ id: SplitMode; label: string }> = [
  { id: "grid", label: "Grid" },
  { id: "tile-size", label: "Tile Size" },
];

const PRESETS = [
  { label: "2x1", c: 2, r: 1, desc: "Horizontal half" },
  { label: "1x2", c: 1, r: 2, desc: "Vertical half" },
  { label: "2x2", c: 2, r: 2, desc: "Quarters" },
  { label: "3x1", c: 3, r: 1, desc: "Horizontal strip" },
  { label: "1x3", c: 1, r: 3, desc: "Vertical strip" },
  { label: "3x3", c: 3, r: 3, desc: "9-tile grid" },
  { label: "2x3", c: 2, r: 3, desc: "6-tile portrait" },
  { label: "3x2", c: 3, r: 2, desc: "6-tile landscape" },
  { label: "4x4", c: 4, r: 4, desc: "16-tile grid" },
];

const OUTPUT_FORMATS = [
  { value: "original", label: "Keep Original" },
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPG" },
  { value: "webp", label: "WebP" },
] as const;

const LOSSY_FORMATS = new Set(["jpg", "webp"]);

export function SplitSettings() {
  const { files, processing: fileStoreProcessing } = useFileStore();
  const {
    mode,
    columns,
    rows,
    tileWidth,
    tileHeight,
    outputFormat,
    quality,
    imageDimensions,
    processing,
    error,
    tiles,
    zipBlobUrl,
    setMode,
    setColumns,
    setRows,
    setTileWidth,
    setTileHeight,
    setOutputFormat,
    setQuality,
    setProcessing,
    setError,
    setTiles,
    setZipBlobUrl,
    applyPreset,
    getEffectiveGrid,
    getComputedTileDimensions,
  } = useSplitStore();

  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);

  const hasFile = files.length > 0;
  const grid = getEffectiveGrid();
  const tileCount = grid.columns * grid.rows;
  const tileDims = getComputedTileDimensions();
  const isLossy = LOSSY_FORMATS.has(outputFormat);
  const hasTiles = tiles.length > 0;

  const tileWarning =
    tileDims && (tileDims.width < 50 || tileDims.height < 50)
      ? `Tiles will be very small (${tileDims.width}x${tileDims.height}px)`
      : null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: files is a store value that triggers reset when changed
  useEffect(() => {
    setTiles([]);
    setZipBlobUrl(null);
    setError(null);
  }, [files, setTiles, setZipBlobUrl, setError]);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setError(null);
    setTiles([]);
    setZipBlobUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      const effectiveGrid = getEffectiveGrid();
      const settings: Record<string, unknown> = {
        columns: effectiveGrid.columns,
        rows: effectiveGrid.rows,
        outputFormat,
      };
      if (mode === "tile-size") {
        settings.tileWidth = tileWidth;
        settings.tileHeight = tileHeight;
      }
      if (LOSSY_FORMATS.has(outputFormat)) {
        settings.quality = quality;
      }
      formData.append("settings", JSON.stringify(settings));

      const res = await fetch("/api/v1/tools/split", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Failed: ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setZipBlobUrl(url);

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(blob);
      const tileEntries: Array<{ row: number; col: number; blobUrl: string | null }> = [];

      const fileNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
      fileNames.sort();

      for (const name of fileNames) {
        const fileData = await zip.files[name].async("blob");
        const tileBlobUrl = URL.createObjectURL(fileData);
        const match = name.match(/_r(\d+)_c(\d+)/);
        const row = match ? Number.parseInt(match[1], 10) : 0;
        const col = match ? Number.parseInt(match[2], 10) : 0;
        tileEntries.push({ row, col, blobUrl: tileBlobUrl });
      }

      tileEntries.sort((a, b) => a.row - b.row || a.col - b.col);
      setTiles(
        tileEntries.map((t, i) => ({
          row: t.row,
          col: t.col,
          label: `${i + 1}`,
          width: 0,
          height: 0,
          blobUrl: t.blobUrl,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Split failed");
    } finally {
      setProcessing(false);
    }
  }, [
    files,
    mode,
    outputFormat,
    quality,
    tileWidth,
    tileHeight,
    getEffectiveGrid,
    setProcessing,
    setError,
    setTiles,
    setZipBlobUrl,
  ]);

  const handleDownloadZip = useCallback(() => {
    if (!zipBlobUrl) return;
    const a = document.createElement("a");
    a.href = zipBlobUrl;
    const baseName = files[0]?.name?.replace(/\.[^.]+$/, "") ?? "split";
    a.download = `${baseName}-${grid.columns}x${grid.rows}.zip`;
    a.click();
  }, [zipBlobUrl, files, grid]);

  const handleDownloadTile = useCallback(
    (index: number) => {
      const tile = tiles[index];
      if (!tile?.blobUrl) return;
      setDownloadingIndex(index);
      const a = document.createElement("a");
      a.href = tile.blobUrl;
      const baseName = files[0]?.name?.replace(/\.[^.]+$/, "") ?? "tile";
      const ext =
        outputFormat === "original" ? (files[0]?.name?.split(".").pop() ?? "png") : outputFormat;
      a.download = `${baseName}_r${tile.row}_c${tile.col}.${ext}`;
      a.click();
      setTimeout(() => setDownloadingIndex(null), 500);
    },
    [tiles, files, outputFormat],
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">Split Mode</p>
        <div className="flex gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex-1 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                mode === m.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "grid" && (
        <>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Presets</p>
            <div className="grid grid-cols-3 gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.c, p.r)}
                  title={p.desc}
                  className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                    columns === p.c && rows === p.r
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="split-columns" className="text-xs text-muted-foreground">
                Columns
              </label>
              <input
                id="split-columns"
                type="number"
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                min={1}
                max={20}
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="split-rows" className="text-xs text-muted-foreground">
                Rows
              </label>
              <input
                id="split-rows"
                type="number"
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                min={1}
                max={20}
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
              />
            </div>
          </div>
        </>
      )}

      {mode === "tile-size" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label htmlFor="split-tile-w" className="text-xs text-muted-foreground">
                Tile Width (px)
              </label>
              <input
                id="split-tile-w"
                type="number"
                value={tileWidth}
                onChange={(e) => setTileWidth(Number(e.target.value))}
                min={10}
                max={imageDimensions?.width ?? 10000}
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="split-tile-h" className="text-xs text-muted-foreground">
                Tile Height (px)
              </label>
              <input
                id="split-tile-h"
                type="number"
                value={tileHeight}
                onChange={(e) => setTileHeight(Number(e.target.value))}
                min={10}
                max={imageDimensions?.height ?? 10000}
                className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground tabular-nums"
              />
            </div>
          </div>
          {imageDimensions && (
            <p className="text-[11px] text-muted-foreground">
              Image: {imageDimensions.width}x{imageDimensions.height}px. Grid: {grid.columns}x
              {grid.rows} = {tileCount} tiles
            </p>
          )}
        </div>
      )}

      {mode === "grid" && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {grid.columns}x{grid.rows} = {tileCount} tiles
          </span>
          {tileDims && (
            <span className="tabular-nums">
              ~{tileDims.width}x{tileDims.height}px each
            </span>
          )}
        </div>
      )}

      {tileWarning && <p className="text-[11px] text-amber-500">{tileWarning}</p>}

      <CollapsibleSection
        title="Output Format"
        badge={outputFormat === "original" ? "Auto" : outputFormat.toUpperCase()}
      >
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-1">
            {OUTPUT_FORMATS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setOutputFormat(f.value as typeof outputFormat)}
                className={`text-xs px-2 py-1.5 rounded-lg transition-colors ${
                  outputFormat === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {isLossy && (
            <div>
              <div className="flex justify-between items-center">
                <label htmlFor="split-quality" className="text-xs text-muted-foreground">
                  Quality
                </label>
                <span className="text-xs font-mono text-foreground">{quality}</span>
              </div>
              <input
                id="split-quality"
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full mt-1"
              />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        type="button"
        data-testid="split-submit"
        onClick={handleProcess}
        disabled={!hasFile || processing || fileStoreProcessing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Splitting..." : `Split into ${tileCount} Tiles`}
      </button>

      {hasTiles && (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-medium text-foreground">{tiles.length} Tiles Generated</p>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${grid.columns}, 1fr)` }}
          >
            {tiles.map((tile, i) => (
              <button
                key={tile.label}
                type="button"
                onClick={() => handleDownloadTile(i)}
                className="group relative aspect-square rounded border border-border overflow-hidden hover:border-primary transition-colors bg-muted"
                title={`Download tile ${tile.label}`}
              >
                {tile.blobUrl && (
                  <img
                    src={tile.blobUrl}
                    alt={`Tile ${tile.label}`}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Download
                    className={`h-3.5 w-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity ${
                      downloadingIndex === i ? "animate-bounce" : ""
                    }`}
                  />
                </div>
                <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] font-bold px-1 rounded tabular-nums">
                  {tile.label}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleDownloadZip}
            className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors"
          >
            <PackageOpen className="h-4 w-4" />
            Download All as ZIP
          </button>
        </div>
      )}
    </div>
  );
}
