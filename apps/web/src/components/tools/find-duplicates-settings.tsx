import { Download, FolderArchive, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
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
  const { t } = useTranslation();
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: files is a store value that triggers reset when changed
  useEffect(() => {
    resetDuplicates();
    setError(null);
    setUploadProgress(0);
  }, [files, resetDuplicates]);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  const handlePreset = (p: Preset) => {
    setPreset(p);
    setThreshold(PRESET_THRESHOLDS[p]);
  };

  const handleSlider = (val: number) => {
    setThreshold(val);
    const match = (Object.entries(PRESET_THRESHOLDS) as [Preset, number][]).find(
      ([, t]) => t === val,
    );
    setPreset(match ? match[0] : null);
  };

  const handleScan = () => {
    if (files.length < 2) return;

    setScanning(true);
    setError(null);
    setResults(null);
    setUploadProgress(0);

    const formData = new FormData();
    for (const file of files) {
      formData.append("file", file);
    }
    formData.append("threshold", String(threshold));

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data: DuplicateResult = JSON.parse(xhr.responseText);
          setResults(data);
        } catch {
          setError("Failed to parse scan results");
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          setError(body.error || `Failed: ${xhr.status}`);
        } catch {
          setError(`Failed: ${xhr.status}`);
        }
      }
      setScanning(false);
    };

    xhr.onerror = () => {
      xhrRef.current = null;
      setError("Network error during upload. Try with fewer files or check connection.");
      setScanning(false);
    };

    xhr.ontimeout = () => {
      xhrRef.current = null;
      setError("Request timed out. Try with fewer files.");
      setScanning(false);
    };

    xhr.open("POST", "/api/v1/tools/find-duplicates");
    xhr.timeout = 300_000;
    const headers = formatHeaders();
    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.send(formData);
  };

  const handleDownloadUnique = useCallback(async () => {
    if (!results) return;

    const { zipSync } = await import("fflate");

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

  const handleDownloadGrouped = useCallback(async () => {
    if (!results || results.duplicateGroups.length === 0) return;

    const { zipSync } = await import("fflate");

    const duplicateFilenames = new Set<string>();
    const zipData: Record<string, Uint8Array> = {};
    const usedPaths = new Set<string>();

    const uniquePath = (dir: string, name: string): string => {
      let path = `${dir}/${name}`;
      if (!usedPaths.has(path)) {
        usedPaths.add(path);
        return path;
      }
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let i = 2;
      while (usedPaths.has(path)) {
        path = `${dir}/${base}-${i}${ext}`;
        i++;
      }
      usedPaths.add(path);
      return path;
    };

    for (let gi = 0; gi < results.duplicateGroups.length; gi++) {
      const group = results.duplicateGroups[gi];
      const similarity = Math.max(...group.files.map((f) => f.similarity));
      const folderName = `group-${gi + 1}-${similarity}pct`;

      for (const gf of group.files) {
        duplicateFilenames.add(gf.filename);
        const file = files.find((f) => f.name === gf.filename);
        if (!file) continue;
        const buf = await file.arrayBuffer();
        zipData[uniquePath(folderName, file.name)] = new Uint8Array(buf);
      }
    }

    const uniqueFiles = files.filter((f) => !duplicateFilenames.has(f.name));
    for (const file of uniqueFiles) {
      const buf = await file.arrayBuffer();
      zipData[uniquePath("unique", file.name)] = new Uint8Array(buf);
    }

    const zipped = zipSync(zipData);
    const blob = new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "duplicates-grouped.zip";
    a.click();
    URL.revokeObjectURL(url);
  }, [files, results]);

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

      {/* Scan button + progress */}
      {!results && (
        <>
          <button
            type="button"
            data-testid="find-duplicates-submit"
            onClick={handleScan}
            disabled={!hasFiles || scanning}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {scanning && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {scanning
              ? uploadProgress < 100
                ? `Uploading... ${uploadProgress}%`
                : "Analyzing..."
              : `Scan ${files.length} Images`}
          </button>
          {scanning && (
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress < 100 ? uploadProgress : 100}%` }}
              />
            </div>
          )}
        </>
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
            {results.skippedFiles && results.skippedFiles.length > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Skipped</span>
                <span className="text-orange-500 font-medium">{results.skippedFiles.length}</span>
              </div>
            )}
          </div>

          {results.skippedFiles && results.skippedFiles.length > 0 && (
            <details className="text-xs">
              <summary className="text-orange-500 cursor-pointer">
                {results.skippedFiles.length} file{results.skippedFiles.length > 1 ? "s" : ""} could
                not be analyzed
              </summary>
              <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                {results.skippedFiles.map((sf) => (
                  <li key={sf.filename} className="truncate" title={`${sf.filename}: ${sf.reason}`}>
                    {sf.filename}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Download actions */}
          {results.duplicateGroups.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleDownloadGrouped}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2"
              >
                <FolderArchive className="h-4 w-4" />
                Download Grouped
              </button>
              <button
                type="button"
                onClick={handleDownloadUnique}
                className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
              >
                <Download className="h-4 w-4" />
                Download Unique Only
              </button>
            </>
          )}

          {/* Re-scan */}
          <button
            type="button"
            onClick={() => {
              resetDuplicates();
              setError(null);
              setUploadProgress(0);
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
