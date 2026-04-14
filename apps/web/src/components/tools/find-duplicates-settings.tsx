import { Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatHeaders } from "@/lib/api";
import { formatFileSize } from "@/lib/download";
import type { DuplicateResult } from "@/stores/duplicate-store";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFileStore } from "@/stores/file-store";

type Preset = "exact" | "similar" | "loose";
const PRESET_THRESHOLDS: Record<Preset, number> = { exact: 2, similar: 8, loose: 14 };
const PRESET_DESCRIPTIONS: Record<Preset, string> = {
  exact: "Pixel-identical copies, same image in different formats.",
  similar: "Resized, recompressed, or lightly edited copies.",
  loose: "Visually related images, mild crops, different exposures.",
};

export function FindDuplicatesSettings() {
  const { files } = useFileStore();
  const {
    results,
    scanning,
    bestOverrides,
    setResults,
    setScanning,
    reset: resetDuplicates,
  } = useDuplicateStore();

  const [preset, setPreset] = useState<Preset | null>("similar");
  const [threshold, setThreshold] = useState(8);
  const [error, setError] = useState<string | null>(null);

  // Reset scan results when files change
  // biome-ignore lint/correctness/useExhaustiveDependencies: files is a store value that triggers reset when changed
  useEffect(() => {
    resetDuplicates();
    setError(null);
  }, [files, resetDuplicates]);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    setThreshold(PRESET_THRESHOLDS[p]);
  };

  const handleSlider = (val: number) => {
    setThreshold(val);
    // Deselect preset if slider doesn't match any
    const match = (Object.entries(PRESET_THRESHOLDS) as [Preset, number][]).find(
      ([, t]) => t === val,
    );
    setPreset(match ? match[0] : null);
  };

  const handleScan = async () => {
    if (files.length < 2) return;

    setScanning(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }
      formData.append("threshold", String(threshold));

      const res = await fetch("/api/v1/tools/find-duplicates", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const data: DuplicateResult = await res.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setScanning(false);
    }
  };

  const handleDownloadUnique = useCallback(async () => {
    if (!results) return;

    const { zipSync } = await import("fflate");

    // Collect filenames of "best" per group (respecting overrides) + all non-duplicate files
    const duplicateFilenames = new Set<string>();
    const bestFilenames = new Set<string>();
    for (let gi = 0; gi < results.duplicateGroups.length; gi++) {
      const group = results.duplicateGroups[gi];
      const bestIdx =
        gi in bestOverrides ? bestOverrides[gi] : group.files.findIndex((f) => f.isBest);
      for (let fi = 0; fi < group.files.length; fi++) {
        duplicateFilenames.add(group.files[fi].filename);
        if (fi === bestIdx) bestFilenames.add(group.files[fi].filename);
      }
    }

    const filesToInclude = files.filter(
      (f) => !duplicateFilenames.has(f.name) || bestFilenames.has(f.name),
    );

    const zipData: Record<string, Uint8Array> = {};
    for (const file of filesToInclude) {
      const buf = await file.arrayBuffer();
      zipData[file.name] = new Uint8Array(buf);
    }

    const zipped = zipSync(zipData);
    const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unique-images.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [files, results, bestOverrides]);

  const handleDownloadAll = useCallback(async () => {
    const { zipSync } = await import("fflate");

    const zipData: Record<string, Uint8Array> = {};
    for (const file of files) {
      const buf = await file.arrayBuffer();
      zipData[file.name] = new Uint8Array(buf);
    }

    const zipped = zipSync(zipData);
    const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "all-images.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [files]);

  const hasFiles = files.length >= 2;
  const activeDesc = preset ? PRESET_DESCRIPTIONS[preset] : null;

  const presetBtnClass = (p: Preset) =>
    `flex-1 text-xs py-1.5 rounded ${preset === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`;

  return (
    <div className="space-y-4">
      {/* Sensitivity presets */}
      <div>
        <span className="text-xs text-muted-foreground">Detection Mode</span>
        <div className="flex gap-1 mt-1">
          <button
            type="button"
            onClick={() => handlePreset("exact")}
            className={presetBtnClass("exact")}
          >
            Exact
          </button>
          <button
            type="button"
            onClick={() => handlePreset("similar")}
            className={presetBtnClass("similar")}
          >
            Similar
          </button>
          <button
            type="button"
            onClick={() => handlePreset("loose")}
            className={presetBtnClass("loose")}
          >
            Loose
          </button>
        </div>
      </div>

      {/* Sensitivity slider */}
      <div>
        <div className="flex justify-between items-center">
          <label htmlFor="dup-threshold" className="text-xs text-muted-foreground">
            Sensitivity
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">{threshold} / 128</span>
        </div>
        <input
          id="dup-threshold"
          type="range"
          min={0}
          max={20}
          value={threshold}
          onChange={(e) => handleSlider(Number(e.target.value))}
          className="w-full mt-1"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Strict match</span>
          <span>Broad match</span>
        </div>
      </div>

      {activeDesc && <p className="text-[10px] text-muted-foreground">{activeDesc}</p>}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Scan button */}
      {!results && (
        <button
          type="button"
          data-testid="find-duplicates-submit"
          onClick={handleScan}
          disabled={!hasFiles || scanning}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {scanning && <Loader2 className="h-4 w-4 animate-spin" />}
          {scanning ? "Scanning..." : `Scan ${files.length} Images`}
        </button>
      )}

      {/* Results: summary + actions */}
      {results && (
        <div className="space-y-3">
          {/* Summary stats */}
          <div className="p-3 rounded-lg bg-muted text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total scanned</span>
              <span className="text-foreground font-medium">{results.totalImages}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duplicate groups</span>
              <span className="text-yellow-500 font-medium">{results.duplicateGroups.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unique images</span>
              <span className="text-green-500 font-medium">{results.uniqueImages}</span>
            </div>
            {results.spaceSaveable > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Space saveable</span>
                <span className="text-primary font-medium">
                  {formatFileSize(results.spaceSaveable)}
                </span>
              </div>
            )}
          </div>

          {/* Download actions */}
          {results.duplicateGroups.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDownloadUnique}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Unique Only
              </button>
              <button
                type="button"
                onClick={handleDownloadAll}
                className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
              >
                Download All
              </button>
            </>
          )}

          {/* Re-scan */}
          <button
            type="button"
            onClick={() => {
              resetDuplicates();
              setError(null);
            }}
            className="w-full py-2 rounded-lg border border-border text-muted-foreground text-xs hover:text-foreground hover:border-foreground/20"
          >
            Re-scan with different settings
          </button>
        </div>
      )}
    </div>
  );
}
