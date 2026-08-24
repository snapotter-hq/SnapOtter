import {
  AlertTriangle,
  BookmarkPlus,
  Download,
  Loader2,
  MapPin,
  PenLine,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CollapsibleSection } from "@/components/common/collapsible-section";
import { MetadataGrid } from "@/components/common/metadata-grid";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { formatHeaders } from "@/lib/api";
import { format } from "@/lib/format";
import { EXIF_LABELS, exifStr, SKIP_KEYS } from "@/lib/metadata-utils";
import { useFileStore } from "@/stores/file-store";

interface InspectResult {
  filename: string;
  fileSize: number;
  exif?: Record<string, unknown> | null;
  iptc?: Record<string, unknown> | null;
  xmp?: Record<string, unknown> | null;
  gps?: Record<string, unknown> | null;
  keywords?: string[];
}

interface FormFields {
  artist: string;
  copyright: string;
  imageDescription: string;
  software: string;
  dateTime: string;
  dateTimeOriginal: string;
  clearGps: boolean;
  gpsLatitude: string;
  gpsLongitude: string;
  gpsAltitude: string;
  dateMode: "edit" | "shift";
  dateShiftDirection: "+" | "-";
  dateShiftValue: string;
  keywords: string[];
  keywordsMode: "add" | "set";
  iptcTitle: string;
  iptcHeadline: string;
  iptcCity: string;
  iptcState: string;
  iptcCountry: string;
}

const EMPTY_FORM: FormFields = {
  artist: "",
  copyright: "",
  imageDescription: "",
  software: "",
  dateTime: "",
  dateTimeOriginal: "",
  clearGps: false,
  gpsLatitude: "",
  gpsLongitude: "",
  gpsAltitude: "",
  dateMode: "edit",
  dateShiftDirection: "+",
  dateShiftValue: "",
  keywords: [],
  keywordsMode: "add",
  iptcTitle: "",
  iptcHeadline: "",
  iptcCity: "",
  iptcState: "",
  iptcCountry: "",
};

interface Template {
  name: string;
  values: Partial<FormFields>;
}

const TEMPLATES_KEY = "metadata-templates";

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: Template[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

function LabeledInput({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  disabled,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function EditMetadataSettings() {
  const { t } = useTranslation();
  const { entries, selectedIndex, files } = useFileStore();
  const {
    processFiles,
    processAllFiles,
    processing,
    error,
    downloadUrl,
    originalSize,
    processedSize,
    progress,
  } = useToolProcessor("edit-metadata");

  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<FormFields>(EMPTY_FORM);
  const [fieldsToRemove, setFieldsToRemove] = useState<Set<string>>(new Set());
  const [inspectData, setInspectData] = useState<InspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectCache, setInspectCache] = useState<Map<string, InspectResult>>(new Map());
  const [keywordInput, setKeywordInput] = useState("");
  const [templates, setTemplates] = useState<Template[]>(loadTemplates);
  const [templateName, setTemplateName] = useState("");

  const currentFile = entries[selectedIndex]?.file ?? null;
  const fileKey = currentFile
    ? `${currentFile.name}-${currentFile.size}-${currentFile.lastModified}`
    : null;

  const populateForm = useCallback((data: InspectResult) => {
    setInspectData(data);
    const exif = data.exif ?? {};
    const iptc = data.iptc ?? {};
    const gps = data.gps ?? {};

    const populated: FormFields = {
      artist: exifStr(exif, "Artist"),
      copyright: exifStr(exif, "Copyright"),
      imageDescription: exifStr(exif, "ImageDescription"),
      software: exifStr(exif, "Software"),
      dateTime: exifStr(exif, "ModifyDate") || exifStr(exif, "DateTime"),
      dateTimeOriginal: exifStr(exif, "DateTimeOriginal"),
      clearGps: false,
      gpsLatitude: gps.GPSLatitude != null ? String(gps.GPSLatitude) : "",
      gpsLongitude: gps.GPSLongitude != null ? String(gps.GPSLongitude) : "",
      gpsAltitude: gps.GPSAltitude != null ? String(gps.GPSAltitude) : "",
      dateMode: "edit",
      dateShiftDirection: "+",
      dateShiftValue: "",
      keywords: data.keywords ?? [],
      keywordsMode: "add",
      iptcTitle: exifStr(iptc, "ObjectName"),
      iptcHeadline: exifStr(iptc, "Headline"),
      iptcCity: exifStr(iptc, "City"),
      iptcState: exifStr(iptc, "Province-State"),
      iptcCountry: exifStr(iptc, "Country-PrimaryLocationName"),
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
        const res = await fetch("/api/v1/tools/image/edit-metadata/inspect", {
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

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !form.keywords.includes(kw)) {
      setField("keywords", [...form.keywords, kw]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setField(
      "keywords",
      form.keywords.filter((k) => k !== kw),
    );
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    const { dateMode, dateShiftDirection, dateShiftValue, ...values } = form;
    const tmpl: Template = { name, values };
    const updated = [...templates.filter((t) => t.name !== name), tmpl];
    setTemplates(updated);
    saveTemplates(updated);
    setTemplateName("");
  };

  const loadTemplate = (name: string) => {
    const tmpl = templates.find((t) => t.name === name);
    if (tmpl) {
      setForm((prev) => ({ ...prev, ...tmpl.values }));
    }
  };

  const deleteTemplate = (name: string) => {
    const updated = templates.filter((t) => t.name !== name);
    setTemplates(updated);
    saveTemplates(updated);
  };

  // Changes summary
  const changes = useMemo(() => {
    let modified = 0;
    const removed = fieldsToRemove.size;
    const simpleFields: (keyof FormFields)[] = [
      "artist",
      "copyright",
      "imageDescription",
      "software",
      "dateTime",
      "dateTimeOriginal",
      "iptcTitle",
      "iptcHeadline",
      "iptcCity",
      "iptcState",
      "iptcCountry",
    ];
    for (const key of simpleFields) {
      if (form[key] !== initialForm[key]) modified++;
    }
    const gpsAdded =
      !form.clearGps &&
      (form.gpsLatitude !== initialForm.gpsLatitude ||
        form.gpsLongitude !== initialForm.gpsLongitude);
    const gpsCleared = form.clearGps;
    const keywordsChanged = JSON.stringify(form.keywords) !== JSON.stringify(initialForm.keywords);
    const hasShift = form.dateMode === "shift" && form.dateShiftValue.trim() !== "";

    if (gpsAdded) modified++;
    if (keywordsChanged) modified++;
    if (hasShift) modified++;

    const total = modified + removed + (gpsCleared ? 1 : 0);
    return { modified, removed, gpsAdded, gpsCleared, keywordsChanged, hasShift, total };
  }, [form, initialForm, fieldsToRemove]);

  const hasFile = files.length > 0;
  const gpsLat = inspectData?.gps?.GPSLatitude as number | undefined;
  const gpsLon = inspectData?.gps?.GPSLongitude as number | undefined;
  const gpsCoords = gpsLat != null && gpsLon != null ? { lat: gpsLat, lon: gpsLon } : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasFile || processing) return;

    const settings: Record<string, unknown> = {};

    // Basic EXIF fields - only send if changed
    if (form.artist !== initialForm.artist && form.artist.trim())
      settings.artist = form.artist.trim();
    if (form.copyright !== initialForm.copyright && form.copyright.trim())
      settings.copyright = form.copyright.trim();
    if (form.imageDescription !== initialForm.imageDescription && form.imageDescription.trim())
      settings.imageDescription = form.imageDescription.trim();
    if (form.software !== initialForm.software && form.software.trim())
      settings.software = form.software.trim();

    // Date fields
    if (form.dateMode === "shift" && form.dateShiftValue.trim()) {
      settings.dateShift = `${form.dateShiftDirection}${form.dateShiftValue.trim()}`;
    } else {
      if (form.dateTime !== initialForm.dateTime && form.dateTime.trim())
        settings.dateTime = form.dateTime.trim();
      if (form.dateTimeOriginal !== initialForm.dateTimeOriginal && form.dateTimeOriginal.trim())
        settings.dateTimeOriginal = form.dateTimeOriginal.trim();
    }

    // GPS
    if (form.clearGps) {
      settings.clearGps = true;
    } else if (
      form.gpsLatitude.trim() &&
      form.gpsLongitude.trim() &&
      (form.gpsLatitude !== initialForm.gpsLatitude ||
        form.gpsLongitude !== initialForm.gpsLongitude ||
        form.gpsAltitude !== initialForm.gpsAltitude)
    ) {
      settings.gpsLatitude = parseFloat(form.gpsLatitude);
      settings.gpsLongitude = parseFloat(form.gpsLongitude);
      if (form.gpsAltitude.trim()) settings.gpsAltitude = parseFloat(form.gpsAltitude);
    }

    // Keywords
    if (JSON.stringify(form.keywords) !== JSON.stringify(initialForm.keywords)) {
      settings.keywords = form.keywords;
      settings.keywordsMode = form.keywordsMode;
    }

    // IPTC fields
    if (form.iptcTitle !== initialForm.iptcTitle && form.iptcTitle.trim())
      settings.iptcTitle = form.iptcTitle.trim();
    if (form.iptcHeadline !== initialForm.iptcHeadline && form.iptcHeadline.trim())
      settings.iptcHeadline = form.iptcHeadline.trim();
    if (form.iptcCity !== initialForm.iptcCity && form.iptcCity.trim())
      settings.iptcCity = form.iptcCity.trim();
    if (form.iptcState !== initialForm.iptcState && form.iptcState.trim())
      settings.iptcState = form.iptcState.trim();
    if (form.iptcCountry !== initialForm.iptcCountry && form.iptcCountry.trim())
      settings.iptcCountry = form.iptcCountry.trim();

    // Fields to remove
    if (fieldsToRemove.size > 0) {
      settings.fieldsToRemove = Array.from(fieldsToRemove);
    }

    if (files.length > 1) {
      processAllFiles(files, settings);
    } else {
      processFiles(files, settings);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Inspect status */}
      {hasFile && inspecting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t.toolSettings["edit-metadata"].readingMetadata}
        </div>
      )}
      {hasFile && inspectError && !inspecting && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {t.toolSettings["edit-metadata"].couldNotReadMetadata}
        </div>
      )}

      {/* Section 1: Basic Info */}
      {hasFile && (
        <CollapsibleSection
          title={t.toolSettings["edit-metadata"].basicInfo}
          defaultOpen
          badge={inspectData ? "EXIF/IPTC" : undefined}
        >
          <div className="space-y-2.5">
            <LabeledInput
              id="em-description"
              label={t.toolSettings["edit-metadata"].description}
              value={form.imageDescription}
              onChange={(v) => setField("imageDescription", v)}
              placeholder={t.toolSettings["edit-metadata"].imageDescription}
            />
            <LabeledInput
              id="em-artist"
              label={t.toolSettings["edit-metadata"].artist}
              value={form.artist}
              onChange={(v) => setField("artist", v)}
              placeholder={t.toolSettings["edit-metadata"].photographerCreatorName}
            />
            <LabeledInput
              id="em-copyright"
              label={t.toolSettings["edit-metadata"].copyright}
              value={form.copyright}
              onChange={(v) => setField("copyright", v)}
              placeholder="2026 Example Corp"
            />
            <LabeledInput
              id="em-software"
              label={t.toolSettings["edit-metadata"].software}
              value={form.software}
              onChange={(v) => setField("software", v)}
              placeholder="e.g. Lightroom, Photoshop"
            />
            <div className="border-t border-border pt-2 mt-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-2">IPTC</p>
              <div className="space-y-2.5">
                <LabeledInput
                  id="em-iptc-title"
                  label={t.toolSettings["edit-metadata"].title}
                  value={form.iptcTitle}
                  onChange={(v) => setField("iptcTitle", v)}
                  placeholder={t.toolSettings["edit-metadata"].imageTitle}
                />
                <LabeledInput
                  id="em-iptc-headline"
                  label={t.toolSettings["edit-metadata"].headline}
                  value={form.iptcHeadline}
                  onChange={(v) => setField("iptcHeadline", v)}
                  placeholder={t.toolSettings["edit-metadata"].shortHeadline}
                />
                <LabeledInput
                  id="em-iptc-city"
                  label={t.toolSettings["edit-metadata"].city}
                  value={form.iptcCity}
                  onChange={(v) => setField("iptcCity", v)}
                  placeholder={t.toolSettings["edit-metadata"].cityName}
                />
                <LabeledInput
                  id="em-iptc-state"
                  label={t.toolSettings["edit-metadata"].stateProvince}
                  value={form.iptcState}
                  onChange={(v) => setField("iptcState", v)}
                  placeholder={t.toolSettings["edit-metadata"].stateOrProvince}
                />
                <LabeledInput
                  id="em-iptc-country"
                  label={t.toolSettings["edit-metadata"].country}
                  value={form.iptcCountry}
                  onChange={(v) => setField("iptcCountry", v)}
                  placeholder={t.toolSettings["edit-metadata"].countryName}
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Section 2: Date & Time */}
      {hasFile && (
        <CollapsibleSection title={t.toolSettings["edit-metadata"].dateAndTime}>
          <div className="space-y-2.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setField("dateMode", "edit")}
                className={`flex-1 text-xs py-1.5 rounded-md border ${form.dateMode === "edit" ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground"}`}
              >
                {t.toolSettings["edit-metadata"].editDates}
              </button>
              <button
                type="button"
                onClick={() => setField("dateMode", "shift")}
                className={`flex-1 text-xs py-1.5 rounded-md border ${form.dateMode === "shift" ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground"}`}
              >
                {t.toolSettings["edit-metadata"].shiftAllDates}
              </button>
            </div>

            {form.dateMode === "edit" ? (
              <>
                <LabeledInput
                  id="em-datetime"
                  label={t.toolSettings["edit-metadata"].dateModified}
                  value={form.dateTime}
                  onChange={(v) => setField("dateTime", v)}
                  placeholder="YYYY:MM:DD HH:MM:SS"
                  hint="EXIF format: 2026:04:11 12:00:00"
                />
                <LabeledInput
                  id="em-datetime-original"
                  label={t.toolSettings["edit-metadata"].dateTaken}
                  value={form.dateTimeOriginal}
                  onChange={(v) => setField("dateTimeOriginal", v)}
                  placeholder="YYYY:MM:DD HH:MM:SS"
                />
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground">
                  {t.toolSettings["edit-metadata"].shiftHint}
                </p>
                <div className="flex gap-2 items-end">
                  <div className="space-y-1">
                    <label
                      htmlFor="em-date-shift-direction"
                      className="text-xs font-medium text-foreground"
                    >
                      {t.toolSettings["edit-metadata"].direction}
                    </label>
                    <select
                      id="em-date-shift-direction"
                      value={form.dateShiftDirection}
                      onChange={(e) => setField("dateShiftDirection", e.target.value as "+" | "-")}
                      className="px-2.5 py-1.5 rounded-md border border-border bg-background text-sm"
                    >
                      <option value="+">{t.toolSettings["edit-metadata"].forward}</option>
                      <option value="-">{t.toolSettings["edit-metadata"].backward}</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <LabeledInput
                      id="em-date-shift"
                      label={t.toolSettings["edit-metadata"].hoursMinutes}
                      value={form.dateShiftValue}
                      onChange={(v) => setField("dateShiftValue", v)}
                      placeholder="1:30"
                      hint="e.g. 1:30 for 1 hour 30 minutes"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Section 3: Location (GPS) */}
      {hasFile && (
        <CollapsibleSection
          title={t.toolSettings["edit-metadata"].locationGps}
          warning={!!gpsCoords}
        >
          <div className="space-y-2.5">
            {gpsCoords && (
              <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                <MapPin className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                    {t.toolSettings["edit-metadata"].locationDataFound}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {gpsCoords.lat.toFixed(6)}, {gpsCoords.lon.toFixed(6)}
                  </p>
                </div>
              </div>
            )}
            {!gpsCoords && (
              <p className="text-[11px] text-muted-foreground italic">
                {t.toolSettings["edit-metadata"].noGpsData}
              </p>
            )}

            <LabeledInput
              id="em-gps-lat"
              label={t.toolSettings["edit-metadata"].latitude}
              type="number"
              value={form.gpsLatitude}
              onChange={(v) => setField("gpsLatitude", v)}
              placeholder="-90 to 90 (e.g. 51.5074)"
              disabled={form.clearGps}
              hint="Decimal degrees. Negative = South"
            />
            <LabeledInput
              id="em-gps-lon"
              label={t.toolSettings["edit-metadata"].longitude}
              type="number"
              value={form.gpsLongitude}
              onChange={(v) => setField("gpsLongitude", v)}
              placeholder="-180 to 180 (e.g. -0.1278)"
              disabled={form.clearGps}
              hint="Decimal degrees. Negative = West"
            />
            <LabeledInput
              id="em-gps-alt"
              label={t.toolSettings["edit-metadata"].altitudeMeters}
              type="number"
              value={form.gpsAltitude}
              onChange={(v) => setField("gpsAltitude", v)}
              placeholder="Optional (e.g. 25)"
              disabled={form.clearGps}
            />

            <label className="flex items-center gap-2 text-xs text-foreground pt-1">
              <input
                type="checkbox"
                checked={form.clearGps}
                onChange={(e) => setField("clearGps", e.target.checked)}
                className="rounded"
              />
              {t.toolSettings["edit-metadata"].removeAllGpsData}
            </label>
          </div>
        </CollapsibleSection>
      )}

      {/* Section 4: Keywords */}
      {hasFile && (
        <CollapsibleSection
          title={t.toolSettings["edit-metadata"].keywords}
          badge={form.keywords.length > 0 ? `${form.keywords.length}` : undefined}
        >
          <div className="space-y-2.5">
            {form.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {form.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary-ink text-[11px]"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className="hover:text-destructive-ink"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                placeholder={t.toolSettings["edit-metadata"].addKeywordPlaceholder}
                className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={addKeyword}
                className="px-2 py-1.5 rounded-md border border-border hover:bg-muted/50"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-foreground">
                <input
                  type="radio"
                  name="kw-mode"
                  checked={form.keywordsMode === "add"}
                  onChange={() => setField("keywordsMode", "add")}
                />
                {t.toolSettings["edit-metadata"].addToExisting}
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-foreground">
                <input
                  type="radio"
                  name="kw-mode"
                  checked={form.keywordsMode === "set"}
                  onChange={() => setField("keywordsMode", "set")}
                />
                {t.toolSettings["edit-metadata"].replaceAll}
              </label>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Section 5: All Metadata (raw view) */}
      {hasFile && inspectData && (
        <CollapsibleSection title={t.toolSettings["edit-metadata"].allMetadata}>
          <div className="space-y-2">
            {inspectData.exif && Object.keys(inspectData.exif).length > 0 && (
              <CollapsibleSection
                title="EXIF"
                badge={`${Object.keys(inspectData.exif).filter((k) => !SKIP_KEYS.has(k)).length}`}
              >
                <MetadataGrid
                  data={inspectData.exif}
                  labelMap={EXIF_LABELS}
                  onRemove={toggleRemoveField}
                  removedKeys={fieldsToRemove}
                />
              </CollapsibleSection>
            )}
            {inspectData.iptc && Object.keys(inspectData.iptc).length > 0 && (
              <CollapsibleSection title="IPTC" badge={`${Object.keys(inspectData.iptc).length}`}>
                <MetadataGrid
                  data={inspectData.iptc}
                  labelMap={EXIF_LABELS}
                  onRemove={toggleRemoveField}
                  removedKeys={fieldsToRemove}
                />
              </CollapsibleSection>
            )}
            {inspectData.xmp && Object.keys(inspectData.xmp).length > 0 && (
              <CollapsibleSection title="XMP" badge={`${Object.keys(inspectData.xmp).length}`}>
                <MetadataGrid
                  data={inspectData.xmp}
                  labelMap={EXIF_LABELS}
                  onRemove={toggleRemoveField}
                  removedKeys={fieldsToRemove}
                />
              </CollapsibleSection>
            )}
            {inspectData.gps && Object.keys(inspectData.gps).length > 0 && (
              <CollapsibleSection title="GPS">
                <MetadataGrid data={inspectData.gps} labelMap={EXIF_LABELS} />
              </CollapsibleSection>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Section 6: Templates */}
      {hasFile && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t.toolSettings["edit-metadata"].templates}
          </p>
          {templates.length > 0 && (
            <div className="space-y-1">
              {templates.map((t) => (
                <div key={t.name} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => loadTemplate(t.name)}
                    className="flex-1 text-start text-xs px-2 py-1 rounded-md border border-border hover:bg-muted/50 truncate"
                  >
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.name)}
                    className="p-1 text-muted-foreground hover:text-destructive-ink"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder={t.toolSettings["edit-metadata"].templateNamePlaceholder}
              className="flex-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              type="button"
              onClick={saveTemplate}
              disabled={!templateName.trim()}
              className="px-2 py-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-50"
              title={t.toolSettings["edit-metadata"].saveCurrentValuesAsTemplate}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* No file placeholder */}
      {!hasFile && (
        <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
          <PenLine className="h-8 w-8 opacity-30" />
          <p className="text-sm">{t.toolSettings["edit-metadata"].uploadPrompt}</p>
        </div>
      )}

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Changes summary */}
      {hasFile && changes.total > 0 && !processing && (
        <div className="text-[11px] text-muted-foreground bg-muted/30 px-2.5 py-2 rounded-md">
          <span className="font-medium text-foreground">
            {format(t.toolSettings["edit-metadata"].changes, { count: changes.total })}
          </span>{" "}
          {changes.modified > 0 &&
            format(t.toolSettings["edit-metadata"].modified, { count: changes.modified })}
          {changes.removed > 0 &&
            `${changes.modified > 0 ? ", " : ""}${format(t.toolSettings["edit-metadata"].removed, {
              count: changes.removed,
            })}`}
          {changes.gpsCleared && t.toolSettings["edit-metadata"].gpsCleared2}
          {changes.gpsAdded && t.toolSettings["edit-metadata"].gpsAdded2}
          {changes.hasShift && t.toolSettings["edit-metadata"].datesShifted2}
        </div>
      )}

      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            {format(t.toolSettings["edit-metadata"].originalSizeKb, {
              size: (originalSize / 1024).toFixed(1),
            })}
          </p>
          <p>
            {format(t.toolSettings["edit-metadata"].processedSizeKb, {
              size: (processedSize / 1024).toFixed(1),
            })}
          </p>
        </div>
      )}

      {processing ? (
        <ProgressCard
          active={processing}
          phase={progress.phase === "idle" ? "uploading" : progress.phase}
          label={t.toolSettings["edit-metadata"].progressLabel}
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
          {t.toolSettings["edit-metadata"].submit}
        </button>
      )}

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="edit-metadata-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          {t.common.download}
        </a>
      )}
    </form>
  );
}
