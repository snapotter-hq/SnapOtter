import { AlertTriangle, ChevronDown, ChevronRight, Download, Loader2, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

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

/** Human-friendly labels for common EXIF keys */
const EXIF_LABELS: Record<string, string> = {
  Make: "Camera Make",
  Model: "Camera Model",
  Software: "Software",
  DateTime: "Date/Time",
  DateTimeOriginal: "Date Taken",
  DateTimeDigitized: "Date Digitized",
  ExposureTime: "Exposure Time",
  FNumber: "F-Number",
  ISOSpeedRatings: "ISO",
  FocalLength: "Focal Length",
  FocalLengthIn35mmFilm: "Focal Length (35mm)",
  ExposureBiasValue: "Exposure Bias",
  MeteringMode: "Metering Mode",
  Flash: "Flash",
  WhiteBalance: "White Balance",
  ExposureMode: "Exposure Mode",
  SceneCaptureType: "Scene Type",
  Contrast: "Contrast",
  Saturation: "Saturation",
  Sharpness: "Sharpness",
  DigitalZoomRatio: "Digital Zoom",
  ImageWidth: "Width",
  ImageLength: "Height",
  Orientation: "Orientation",
  XResolution: "X Resolution",
  YResolution: "Y Resolution",
  ResolutionUnit: "Resolution Unit",
  ColorSpace: "Color Space",
  PixelXDimension: "Pixel Width",
  PixelYDimension: "Pixel Height",
  Artist: "Artist",
  Copyright: "Copyright",
  ImageDescription: "Description",
  LensMake: "Lens Make",
  LensModel: "Lens Model",
  BodySerialNumber: "Body Serial",
  CameraOwnerName: "Camera Owner",
};

/** Keys to skip in display (internal/binary/redundant) */
const SKIP_KEYS = new Set([
  "ExifTag",
  "GPSTag",
  "InteroperabilityTag",
  "MakerNote",
  "PrintImageMatching",
  "ComponentsConfiguration",
  "FlashpixVersion",
  "ExifVersion",
  "FileSource",
  "SceneType",
  "UserComment",
  "InteroperabilityIndex",
  "InteroperabilityVersion",
]);

function formatExifValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    if (key === "ExposureTime" && value > 0 && value < 1) {
      return `1/${Math.round(1 / value)}s`;
    }
    if (key === "FNumber") return `f/${value}`;
    if (key === "FocalLength") return `${value}mm`;
    if (key === "FocalLengthIn35mmFilm") return `${value}mm`;
    return String(value);
  }
  if (Array.isArray(value)) {
    if (typeof value[0] === "number" && value.length <= 4) {
      return value.join(", ");
    }
    return `[${value.length} values]`;
  }
  return String(value);
}

function CollapsibleSection({
  title,
  badge,
  warning,
  defaultOpen,
  children,
}: {
  title: string;
  badge?: string;
  warning?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="flex-1 text-left">{title}</span>
        {warning && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
        {badge && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

function MetadataGrid({
  data,
  labelMap,
}: {
  data: Record<string, unknown>;
  labelMap?: Record<string, string>;
}) {
  const entries = Object.entries(data).filter(
    ([k, v]) =>
      !SKIP_KEYS.has(k) && !k.startsWith("_") && v !== undefined && v !== null && String(v) !== "",
  );

  if (entries.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">No data</p>;
  }

  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-2 gap-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <div className="text-[10px] text-muted-foreground truncate" title={k}>
            {labelMap?.[k] ?? k}
          </div>
          <div
            className="text-[10px] text-foreground font-mono truncate"
            title={formatExifValue(k, v)}
          >
            {formatExifValue(k, v)}
          </div>
        </div>
      ))}
    </div>
  );
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

  // Per-file metadata cache (from feature branch)
  const [metadataCache, setMetadataCache] = useState<Map<string, MetadataResult>>(new Map());
  const [metadata, setMetadata] = useState<MetadataResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const currentFile = entries[selectedIndex]?.file ?? null;
  const fileKey = currentFile
    ? `${currentFile.name}-${currentFile.size}-${currentFile.lastModified}`
    : null;

  // Auto-fetch metadata for the selected file (with per-file caching)
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
        if (fileKey) setMetadataCache((prev) => new Map(prev).set(fileKey, data));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setInspectError(err instanceof Error ? err.message : "Failed to inspect metadata");
      } finally {
        setInspecting(false);
      }
    })();

    return () => controller.abort();
  }, [currentFile, fileKey, metadataCache]);

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

  const hasExif = metadata?.exif && Object.keys(metadata.exif).length > 0;
  const hasGps = metadata?.gps && Object.keys(metadata.gps).length > 0;
  const hasIcc = metadata?.icc && Object.keys(metadata.icc).length > 0;
  const hasXmp = metadata?.xmp && Object.keys(metadata.xmp).length > 0;
  const hasAnyMetadata = hasExif || hasGps || hasIcc || hasXmp;
  const sectionCount = [hasExif, hasGps, hasIcc, hasXmp].filter(Boolean).length;

  // GPS coordinates for display
  const gpsLat = metadata?.gps?._latitude as number | null | undefined;
  const gpsLon = metadata?.gps?._longitude as number | null | undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Metadata Display */}
      {hasFile && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Current Metadata</p>

          {inspecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading metadata...
            </div>
          )}

          {inspectError && <p className="text-[10px] text-red-500">{inspectError}</p>}

          {metadata && !hasAnyMetadata && !inspecting && (
            <p className="text-xs text-muted-foreground italic py-1">
              No metadata found in this image.
            </p>
          )}

          {metadata && hasAnyMetadata && (
            <div className="space-y-1.5">
              {/* GPS warning banner */}
              {hasGps && gpsLat != null && gpsLon != null && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <MapPin className="h-3 w-3 text-amber-500 shrink-0" />
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    Location data: {gpsLat.toFixed(4)}, {gpsLon.toFixed(4)}
                  </span>
                </div>
              )}

              {hasExif && metadata.exif && (
                <CollapsibleSection
                  title="EXIF"
                  badge={`${Object.keys(metadata.exif).filter((k) => !SKIP_KEYS.has(k) && !k.startsWith("_")).length} fields`}
                  defaultOpen
                >
                  <MetadataGrid data={metadata.exif} labelMap={EXIF_LABELS} />
                </CollapsibleSection>
              )}

              {metadata?.exifError && (
                <p className="text-[11px] text-muted-foreground">EXIF: {metadata.exifError}</p>
              )}

              {hasGps && metadata.gps && (
                <CollapsibleSection
                  title="GPS"
                  warning
                  badge={`${Object.keys(metadata.gps).filter((k) => !k.startsWith("_")).length} fields`}
                >
                  <MetadataGrid data={metadata.gps} />
                </CollapsibleSection>
              )}

              {hasIcc && metadata.icc && (
                <CollapsibleSection
                  title="ICC Profile"
                  badge={`${Object.keys(metadata.icc).length} fields`}
                >
                  <MetadataGrid data={metadata.icc} />
                </CollapsibleSection>
              )}

              {hasXmp && metadata.xmp && (
                <CollapsibleSection
                  title="XMP"
                  badge={`${Object.keys(metadata.xmp).length} fields`}
                >
                  <MetadataGrid data={metadata.xmp} />
                </CollapsibleSection>
              )}

              <p className="text-[10px] text-muted-foreground">
                {sectionCount} metadata {sectionCount === 1 ? "section" : "sections"} found
              </p>
            </div>
          )}
        </div>
      )}

      {hasFile && hasAnyMetadata && <div className="border-t border-border" />}

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
        <p className="text-xs text-muted-foreground">Or select specific metadata:</p>

        <label
          className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}
        >
          <input
            type="checkbox"
            checked={stripExif}
            onChange={(e) => setStripExif(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip EXIF (camera info, date, exposure)
          {hasExif && !stripAll && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {Object.keys(metadata?.exif ?? {}).filter((k) => !SKIP_KEYS.has(k)).length} fields
            </span>
          )}
        </label>

        <label
          className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}
        >
          <input
            type="checkbox"
            checked={stripGps}
            onChange={(e) => setStripGps(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip GPS (location data)
          {hasGps && !stripAll && (
            <span className="ml-auto text-[10px] text-amber-500">location found</span>
          )}
        </label>

        <label
          className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}
        >
          <input
            type="checkbox"
            checked={stripIcc}
            onChange={(e) => setStripIcc(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip ICC (color profile)
        </label>

        <label
          className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}
        >
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
          data-testid="strip-metadata-submit"
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
          data-testid="strip-metadata-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
