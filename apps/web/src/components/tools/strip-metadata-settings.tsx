import { useState, useEffect } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download, Loader2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { ProgressCard } from "@/components/common/progress-card";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

interface MetadataResult {
  filename: string;
  fileSize: number;
  exif?: Record<string, unknown> | null;
  exifError?: string;
  gps?: Record<string, unknown> | null;
  icc?: Record<string, string> | null;
  xmp?: Record<string, string> | null;
}

export function StripMetadataSettings() {
  const { entries, selectedIndex, files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("strip-metadata");

  const [stripAll, setStripAll] = useState(true);
  const [stripExif, setStripExif] = useState(false);
  const [stripGps, setStripGps] = useState(false);
  const [stripIcc, setStripIcc] = useState(false);
  const [stripXmp, setStripXmp] = useState(false);

  // Metadata inspection state
  const [metadataCache, setMetadataCache] = useState<Map<string, MetadataResult>>(new Map());
  const [metadata, setMetadata] = useState<MetadataResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const currentFile = entries[selectedIndex]?.file ?? null;
  const fileKey = currentFile ? `${currentFile.name}-${currentFile.size}-${currentFile.lastModified}` : null;

  // Auto-fetch metadata for the selected file
  useEffect(() => {
    if (!currentFile || !fileKey) {
      setMetadata(null);
      setInspectError(null);
      return;
    }

    // Check cache first
    const cached = metadataCache.get(fileKey);
    if (cached) {
      setMetadata(cached);
      return;
    }

    const controller = new AbortController();
    (async () => {
      setInspecting(true);
      setInspectError(null);
      setMetadata(null);
      try {
        const formData = new FormData();
        formData.append("file", currentFile);
        const res = await fetch("/api/v1/tools/strip-metadata/inspect", {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
          body: formData,
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed: ${res.status}`);
        }
        const data: MetadataResult = await res.json();
        setMetadata(data);
        setMetadataCache((prev) => new Map(prev).set(fileKey!, data));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setInspectError(err instanceof Error ? err.message : "Failed to inspect metadata");
      } finally {
        setInspecting(false);
      }
    })();

    return () => controller.abort();
  }, [currentFile, fileKey]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const handleStripAllChange = (checked: boolean) => {
    setStripAll(checked);
    if (checked) {
      setStripExif(false);
      setStripGps(false);
      setStripIcc(false);
      setStripXmp(false);
    }
  };

  const handleProcess = () => {
    processFiles(files, { stripAll, stripExif, stripGps, stripIcc, stripXmp });
  };

  const hasFile = files.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  const hasGps = metadata?.gps && Object.keys(metadata.gps).length > 0;

  const renderMetadataSection = (title: string, key: string, data: Record<string, unknown> | null | undefined) => {
    if (!data || Object.keys(data).length === 0) return null;
    const expanded = expandedSections.has(key);
    return (
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection(key)}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {title}
          <span className="text-muted-foreground ml-auto">{Object.keys(data).length} fields</span>
        </button>
        {expanded && (
          <div className="border-t border-border px-2.5 py-1.5 space-y-0.5">
            {Object.entries(data).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-[11px]">
                <span className="text-muted-foreground shrink-0">{k}:</span>
                <span className="text-foreground font-mono break-all">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Metadata inspection */}
      {inspecting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Inspecting metadata...
        </div>
      )}

      {inspectError && <p className="text-xs text-red-500">{inspectError}</p>}

      {metadata && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Current File Metadata</label>

          {hasGps && (
            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                This image contains GPS location data. Consider stripping it for privacy.
              </p>
            </div>
          )}

          {renderMetadataSection("EXIF", "exif", metadata.exif)}
          {metadata.exifError && (
            <p className="text-[11px] text-muted-foreground">EXIF: {metadata.exifError}</p>
          )}
          {renderMetadataSection("GPS", "gps", metadata.gps)}
          {renderMetadataSection("ICC Profile", "icc", metadata.icc)}
          {renderMetadataSection("XMP", "xmp", metadata.xmp)}

          {!metadata.exif && !metadata.gps && !metadata.icc && !metadata.xmp && !metadata.exifError && (
            <p className="text-xs text-muted-foreground">No metadata found in this file.</p>
          )}
        </div>
      )}

      <div className="border-t border-border" />

      {/* Strip All */}
      <label className="flex items-center gap-2 text-sm text-foreground font-medium">
        <input
          type="checkbox"
          checked={stripAll}
          onChange={(e) => handleStripAllChange(e.target.checked)}
          className="rounded"
        />
        Strip All Metadata
      </label>

      <div className="border-t border-border" />

      {/* Individual options */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Or select specific metadata:</label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripExif}
            onChange={(e) => setStripExif(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip EXIF (camera info, date, exposure)
        </label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripGps}
            onChange={(e) => setStripGps(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip GPS (location data)
        </label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripIcc}
            onChange={(e) => setStripIcc(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip ICC (color profile)
        </label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripXmp}
            onChange={(e) => setStripXmp(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip XMP (extensible metadata)
        </label>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
          <p>Metadata removed: {((originalSize - processedSize) / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Stripping metadata"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Strip Metadata
        </button>
      )}

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
