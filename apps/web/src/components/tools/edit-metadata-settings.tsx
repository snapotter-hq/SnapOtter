import { AlertTriangle, Download, Loader2, MapPin, PenLine } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { MetadataGrid } from "@/components/common/metadata-grid";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { formatHeaders } from "@/lib/api";
import { EXIF_LABELS, exifStr, SKIP_KEYS } from "@/lib/metadata-utils";
import { useFileStore } from "@/stores/file-store";

interface InspectResult {
  filename: string;
  fileSize: number;
  exif?: Record<string, unknown> | null;
  exifError?: string;
  gps?: Record<string, unknown> | null;
  xmp?: Record<string, string> | null;
}

interface FormFields {
  artist: string;
  copyright: string;
  imageDescription: string;
  software: string;
  dateTime: string;
  dateTimeOriginal: string;
  clearGps: boolean;
}

const EMPTY_FORM: FormFields = {
  artist: "",
  copyright: "",
  imageDescription: "",
  software: "",
  dateTime: "",
  dateTimeOriginal: "",
  clearGps: false,
};

function LabeledInput({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EditMetadataSettings() {
  const { entries, selectedIndex, files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize, progress } =
    useToolProcessor("edit-metadata");

  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<FormFields>(EMPTY_FORM);
  const [fieldsToRemove, setFieldsToRemove] = useState<Set<string>>(new Set());
  const [inspectData, setInspectData] = useState<InspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectCache, setInspectCache] = useState<Map<string, InspectResult>>(new Map());

  const currentFile = entries[selectedIndex]?.file ?? null;
  const fileKey = currentFile
    ? `${currentFile.name}-${currentFile.size}-${currentFile.lastModified}`
    : null;

  const populateForm = useCallback((data: InspectResult) => {
    const exif = data.exif ?? {};
    setInspectData(data);
    const populated: FormFields = {
      artist: exifStr(exif, "Artist"),
      copyright: exifStr(exif, "Copyright"),
      imageDescription: exifStr(exif, "ImageDescription"),
      software: exifStr(exif, "Software"),
      dateTime: exifStr(exif, "DateTime"),
      dateTimeOriginal: exifStr(exif, "DateTimeOriginal"),
      clearGps: false,
    };
    setForm(populated);
    setInitialForm(populated);
    setFieldsToRemove(new Set());
  }, []);

  useEffect(() => {
    if (!currentFile || !fileKey) {
      setForm(EMPTY_FORM);
      setInitialForm(EMPTY_FORM);
      setInspectData(null);
      setInspectError(null);
      setFieldsToRemove(new Set());
      return;
    }

    const cached = inspectCache.get(fileKey);
    if (cached) {
      populateForm(cached);
      return;
    }

    const controller = new AbortController();
    (async () => {
      setInspecting(true);
      setInspectError(null);
      setInspectData(null);
      try {
        const formData = new FormData();
        formData.append("file", currentFile);
        const res = await fetch("/api/v1/tools/edit-metadata/inspect", {
          method: "POST",
          headers: formatHeaders(),
          body: formData,
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed: ${res.status}`);
        }
        const data: InspectResult = await res.json();
        setInspectCache((prev) => new Map(prev).set(fileKey, data));
        populateForm(data);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setInspectError(err instanceof Error ? err.message : "Failed to inspect file");
        setForm(EMPTY_FORM);
        setInitialForm(EMPTY_FORM);
      } finally {
        setInspecting(false);
      }
    })();

    return () => controller.abort();
  }, [currentFile, fileKey, inspectCache, populateForm]);

  const setField = <K extends keyof FormFields>(key: K, value: FormFields[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleRemoveField = (key: string) => {
    setFieldsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasFile = files.length > 0;
  const gpsLat = inspectData?.gps?._latitude as number | undefined;
  const gpsLon = inspectData?.gps?._longitude as number | undefined;
  const gpsCoords = gpsLat != null && gpsLon != null ? { lat: gpsLat, lon: gpsLon } : null;
  const exifEntryCount = inspectData?.exif
    ? Object.keys(inspectData.exif).filter((k) => !SKIP_KEYS.has(k) && !k.startsWith("_")).length
    : 0;
  const hasGps =
    !!inspectData?.gps && Object.keys(inspectData.gps).filter((k) => !k.startsWith("_")).length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasFile || processing) return;

    const settings: Record<string, unknown> = { clearGps: form.clearGps };

    const fieldMap: Array<{
      formKey: keyof FormFields;
      settingsKey: string;
      exifTag: string;
    }> = [
      { formKey: "artist", settingsKey: "artist", exifTag: "Artist" },
      { formKey: "copyright", settingsKey: "copyright", exifTag: "Copyright" },
      {
        formKey: "imageDescription",
        settingsKey: "imageDescription",
        exifTag: "ImageDescription",
      },
      { formKey: "software", settingsKey: "software", exifTag: "Software" },
      { formKey: "dateTime", settingsKey: "dateTime", exifTag: "DateTime" },
      {
        formKey: "dateTimeOriginal",
        settingsKey: "dateTimeOriginal",
        exifTag: "DateTimeOriginal",
      },
    ];

    const removeSet = new Set(fieldsToRemove);

    for (const { formKey, settingsKey, exifTag } of fieldMap) {
      const current = form[formKey] as string;
      const initial = initialForm[formKey] as string;
      if (current !== initial) {
        if (current.trim()) {
          settings[settingsKey] = current.trim();
          removeSet.delete(exifTag);
        } else {
          removeSet.add(exifTag);
        }
      }
    }

    if (removeSet.size > 0) {
      settings.fieldsToRemove = Array.from(removeSet);
    }

    processFiles(files, settings);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Current Metadata */}
      {hasFile && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Current Metadata</p>

          {inspecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Reading metadata...
            </div>
          )}

          {inspectError && !inspecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Could not read metadata - fields will start empty.
            </div>
          )}

          {inspectData && (
            <div className="space-y-1.5">
              {exifEntryCount > 0 && inspectData.exif ? (
                <CollapsibleSection title="EXIF" badge={`${exifEntryCount} fields`}>
                  <MetadataGrid
                    data={inspectData.exif}
                    labelMap={EXIF_LABELS}
                    onRemove={toggleRemoveField}
                    removedKeys={fieldsToRemove}
                  />
                </CollapsibleSection>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">No EXIF data found.</p>
              )}
              {hasGps && inspectData.gps && (
                <CollapsibleSection title="GPS" warning>
                  <MetadataGrid
                    data={Object.fromEntries(
                      Object.entries(inspectData.gps).filter(([k]) => !k.startsWith("_")),
                    )}
                  />
                </CollapsibleSection>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Fields */}
      {hasFile && (
        <div className="space-y-3">
          <div className="border-t border-border" />
          <p className="text-xs font-medium text-muted-foreground">Edit Fields</p>

          <LabeledInput
            id="em-description"
            label="Description"
            value={form.imageDescription}
            onChange={(v) => setField("imageDescription", v)}
            placeholder="Image description"
          />
          <LabeledInput
            id="em-artist"
            label="Artist"
            value={form.artist}
            onChange={(v) => setField("artist", v)}
            placeholder="Photographer / creator name"
          />
          <LabeledInput
            id="em-copyright"
            label="Copyright"
            value={form.copyright}
            onChange={(v) => setField("copyright", v)}
            placeholder="2026 Example"
          />
          <LabeledInput
            id="em-software"
            label="Software"
            value={form.software}
            onChange={(v) => setField("software", v)}
            placeholder="e.g. Lightroom, Photoshop"
          />
          <LabeledInput
            id="em-datetime"
            label="Date Modified"
            value={form.dateTime}
            onChange={(v) => setField("dateTime", v)}
            placeholder="YYYY:MM:DD HH:MM:SS"
            hint="EXIF date format: 2026:04:06 12:00:00"
          />
          <LabeledInput
            id="em-datetime-original"
            label="Date Taken"
            value={form.dateTimeOriginal}
            onChange={(v) => setField("dateTimeOriginal", v)}
            placeholder="YYYY:MM:DD HH:MM:SS"
          />

          {/* GPS */}
          <div className="space-y-2">
            <div className="border-t border-border" />
            {gpsCoords ? (
              <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Location data found
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {gpsCoords.lat.toFixed(5)}, {gpsCoords.lon.toFixed(5)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">No GPS data in this image.</p>
            )}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.clearGps}
                onChange={(e) => setField("clearGps", e.target.checked)}
                className="rounded"
              />
              Remove GPS location data
            </label>
          </div>
        </div>
      )}

      {!hasFile && (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
          <PenLine className="h-8 w-8 opacity-30" />
          <p className="text-sm">Upload an image to edit its metadata.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label="Writing metadata"
          stage={progress.stage}
          percent={progress.percent}
          elapsed={progress.elapsed}
        />
      ) : (
        <button
          type="submit"
          data-testid="edit-metadata-submit"
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          Apply Metadata
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="edit-metadata-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
