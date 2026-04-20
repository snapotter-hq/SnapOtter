import {
  PASSPORT_SPECS,
  type PassportDocumentSpec,
  type PassportRegion,
  type PassportSpec,
} from "@ashim/shared";
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Move,
  RotateCcw,
  Search,
  UserCheck,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { ProgressCard } from "@/components/common/progress-card";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

// ── Types ──────────────────────────────────────────────────────────

interface FaceLandmarks {
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  eyeCenter: { x: number; y: number };
  chin: { x: number; y: number };
  forehead: { x: number; y: number };
  crown: { x: number; y: number };
  nose: { x: number; y: number };
  faceCenterX: number;
}

interface AnalyzeResult {
  preview: string; // base64 PNG
  landmarks: FaceLandmarks;
  imageWidth: number;
  imageHeight: number;
  jobId: string;
  filename: string;
}

interface GenerateResult {
  downloadUrl: string;
  dimensions: { width: number; height: number };
  spec: { country: string; document: string };
}

interface ComplianceCheck {
  label: string;
  pass: boolean;
  detail: string;
}

// ── Zustand store ─────────────────────────────────────────────────

interface PassportPhotoStore {
  analyzeResult: AnalyzeResult | null;
  setAnalyzeResult: (r: AnalyzeResult | null) => void;
  countryCode: string;
  setCountryCode: (c: string) => void;
  documentType: string;
  setDocumentType: (t: string) => void;
  bgColor: string;
  setBgColor: (c: string) => void;
  maxFileSizeKb: number;
  setMaxFileSizeKb: (s: number) => void;
  dpi: number;
  setDpi: (d: number) => void;
  customWidthMm: number | null;
  customHeightMm: number | null;
  setCustomDimensions: (w: number | null, h: number | null) => void;
  adjustX: number;
  adjustY: number;
  setAdjustX: (x: number) => void;
  setAdjustY: (y: number) => void;
  zoom: number;
  setZoom: (z: number) => void;
  generateResult: GenerateResult | null;
  setGenerateResult: (r: GenerateResult | null) => void;
  analyzing: boolean;
  setAnalyzing: (a: boolean) => void;
  generating: boolean;
  setGenerating: (g: boolean) => void;
}

const usePassportPhotoStore = create<PassportPhotoStore>((set) => ({
  analyzeResult: null,
  setAnalyzeResult: (analyzeResult) => set({ analyzeResult, generateResult: null }),
  countryCode: "US",
  setCountryCode: (countryCode) =>
    set({ countryCode, generateResult: null, customWidthMm: null, customHeightMm: null }),
  documentType: "passport",
  setDocumentType: (documentType) => set({ documentType, generateResult: null }),
  bgColor: "#FFFFFF",
  setBgColor: (bgColor) => set({ bgColor, generateResult: null }),
  maxFileSizeKb: 0,
  setMaxFileSizeKb: (maxFileSizeKb) => set({ maxFileSizeKb }),
  dpi: 300,
  setDpi: (dpi) => set({ dpi, generateResult: null }),
  customWidthMm: null,
  customHeightMm: null,
  setCustomDimensions: (customWidthMm, customHeightMm) =>
    set({ customWidthMm, customHeightMm, countryCode: "CUSTOM", generateResult: null }),
  adjustX: 0,
  adjustY: 0,
  setAdjustX: (adjustX) => set({ adjustX, generateResult: null }),
  setAdjustY: (adjustY) => set({ adjustY, generateResult: null }),
  zoom: 1,
  setZoom: (zoom) => set({ zoom }),
  generateResult: null,
  setGenerateResult: (generateResult) => set({ generateResult }),
  analyzing: false,
  setAnalyzing: (analyzing) => set({ analyzing }),
  generating: false,
  setGenerating: (generating) => set({ generating }),
}));

// ── Region groups ──────────────────────────────────────────────────

const REGION_LABELS: Record<PassportRegion, string> = {
  americas: "Americas",
  europe: "Europe",
  asia: "Asia",
  "middle-east": "Middle East",
  africa: "Africa",
  oceania: "Oceania",
};

const REGION_ORDER: PassportRegion[] = [
  "americas",
  "europe",
  "asia",
  "middle-east",
  "africa",
  "oceania",
];

function groupByRegion(): Map<PassportRegion, PassportSpec[]> {
  const groups = new Map<PassportRegion, PassportSpec[]>();
  for (const r of REGION_ORDER) groups.set(r, []);
  for (const spec of PASSPORT_SPECS) {
    const list = groups.get(spec.region);
    if (list) list.push(spec);
  }
  return groups;
}

// ── Helpers ────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

const CUSTOM_SPEC: PassportSpec = {
  code: "CUSTOM",
  name: "Custom",
  flag: "\u2699\uFE0F",
  region: "americas",
  documents: [
    {
      type: "passport",
      label: "Custom",
      width: 35,
      height: 45,
      dpi: 300,
      headHeightMin: 0.7,
      headHeightMax: 0.8,
      eyeLineFromBottom: 0.63,
      bgColor: "#FFFFFF",
      bgColors: ["#FFFFFF"],
    },
  ],
};

function getDocSpec(
  countryCode: string,
  documentType: string,
  customW: number | null,
  customH: number | null,
  dpi: number,
): PassportDocumentSpec {
  if (countryCode === "CUSTOM" && customW && customH) {
    return { ...CUSTOM_SPEC.documents[0], width: customW, height: customH, dpi };
  }
  const spec = PASSPORT_SPECS.find((s) => s.code === countryCode) ?? PASSPORT_SPECS[0];
  const doc = spec.documents.find((d) => d.type === documentType) ?? spec.documents[0];
  return { ...doc, dpi };
}

function getCountrySpec(countryCode: string): PassportSpec {
  if (countryCode === "CUSTOM") return CUSTOM_SPEC;
  return PASSPORT_SPECS.find((s) => s.code === countryCode) ?? PASSPORT_SPECS[0];
}

function formatDimensions(doc: PassportDocumentSpec): string {
  return `${doc.width}x${doc.height}mm`;
}

function getPixelDimensions(doc: PassportDocumentSpec): { w: number; h: number } {
  const MM_PER_INCH = 25.4;
  return {
    w: Math.round((doc.width / MM_PER_INCH) * doc.dpi),
    h: Math.round((doc.height / MM_PER_INCH) * doc.dpi),
  };
}

// ── File size presets ─────────────────────────────────────────────

const FILE_SIZE_PRESETS = [
  { label: "No limit", value: 0 },
  { label: "50 KB", value: 50 },
  { label: "100 KB", value: 100 },
  { label: "200 KB", value: 200 },
  { label: "500 KB", value: 500 },
];

// ── Common background colors for passport photos ──────────────────

const COMMON_BG_COLORS = [
  { color: "#FFFFFF", label: "White" },
  { color: "#F0F0F0", label: "Off-white" },
  { color: "#D4D4D4", label: "Light gray (UK/DE)" },
  { color: "#BFDBFE", label: "Light blue (FR)" },
  { color: "#EF4444", label: "Red (ID)" },
];

// ── Canvas helpers ─────────────────────────────────────────────────

function computeCropRegion(
  doc: PassportDocumentSpec,
  landmarks: FaceLandmarks,
  imageWidth: number,
  imageHeight: number,
  adjustX: number,
  adjustY: number,
) {
  const targetHeadRatio = (doc.headHeightMin + doc.headHeightMax) / 2;

  const crownYPx = (landmarks.crown.y + adjustY) * imageHeight;
  const chinYPx = (landmarks.chin.y + adjustY) * imageHeight;
  const eyeYPx = (landmarks.eyeCenter.y + adjustY) * imageHeight;
  const faceCenterXPx = (landmarks.faceCenterX + adjustX) * imageWidth;

  const headHeightPx = chinYPx - crownYPx;
  const photoHeightPx = headHeightPx / targetHeadRatio;
  const photoWidthPx = photoHeightPx * (doc.width / doc.height);

  const topY = eyeYPx - photoHeightPx * (1 - doc.eyeLineFromBottom);
  const leftX = faceCenterXPx - photoWidthPx / 2;

  return { leftX, topY, photoWidthPx, photoHeightPx };
}

function runComplianceChecks(landmarks: FaceLandmarks): ComplianceCheck[] {
  // 1. Face centered - is the face horizontally centered in the source photo?
  const centerOk = Math.abs(landmarks.faceCenterX - 0.5) < 0.08;

  // 2. Head level - are the eyes at the same height (no tilt)?
  const eyeTilt = Math.abs(landmarks.leftEye.y - landmarks.rightEye.y);
  const levelOk = eyeTilt < 0.02;

  // 3. Looking straight - is the nose centered between the eyes (not turned)?
  const eyeMidX = (landmarks.leftEye.x + landmarks.rightEye.x) / 2;
  const noseOffset = Math.abs(landmarks.nose.x - eyeMidX);
  const straightOk = noseOffset < 0.03;

  // 4. Face size - is the face large enough for a quality crop?
  const faceHeight = landmarks.chin.y - landmarks.crown.y;
  const sizeOk = faceHeight > 0.15;

  return [
    {
      label: "Face centered",
      pass: centerOk,
      detail: "Face is off-center. Crop or reposition your photo.",
    },
    {
      label: "Head level",
      pass: levelOk,
      detail: "Head is tilted. Straighten your head or rotate the photo.",
    },
    {
      label: "Looking straight",
      pass: straightOk,
      detail: "Face is turned sideways. Look directly at the camera.",
    },
    {
      label: "Face size",
      pass: sizeOk,
      detail: "Face is too small. Get closer to the camera or crop tighter.",
    },
  ];
}

// ── Country option item ────────────────────────────────────────────

function CountryOption({
  spec,
  selected,
  onSelect,
}: {
  spec: PassportSpec;
  selected: boolean;
  onSelect: () => void;
}) {
  const doc = spec.documents[0];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        selected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
      }`}
    >
      <span>{spec.flag}</span>
      <span className="flex-1 text-left">{spec.name}</span>
      <span className="text-muted-foreground/60 tabular-nums text-[10px]">
        {formatDimensions(doc)}
      </span>
      {selected && <Check className="h-3 w-3 text-primary shrink-0" />}
    </button>
  );
}

// ── Settings panel (left side) ─────────────────────────────────────

export function PassportPhotoSettings() {
  const { files } = useFileStore();
  const { error } = useToolProcessor("passport-photo");

  const {
    countryCode,
    setCountryCode,
    documentType,
    setDocumentType,
    bgColor,
    setBgColor,
    maxFileSizeKb,
    setMaxFileSizeKb,
    dpi,
    setDpi,
    customWidthMm,
    customHeightMm,
    setCustomDimensions,
    analyzeResult,
    setAnalyzeResult,
    generateResult,
    setGenerateResult,
    analyzing,
    setAnalyzing,
    generating,
    setGenerating,
    zoom,
    adjustX,
    adjustY,
  } = usePassportPhotoStore();

  // Country search
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  // Custom inputs
  const [customSizeInput, setCustomSizeInput] = useState("");
  const [customWInput, setCustomWInput] = useState("");
  const [customHInput, setCustomHInput] = useState("");

  // Errors
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Derived state
  const selectedSpec = getCountrySpec(countryCode);
  const isCustom = countryCode === "CUSTOM";
  const docSpec = getDocSpec(countryCode, documentType, customWidthMm, customHeightMm, dpi);
  const hasFile = files.length > 0;
  const uniqueDocTypes = [...new Set(selectedSpec.documents.map((d) => d.type))];
  const pxDims = getPixelDimensions(docSpec);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [dropdownOpen]);

  // Auto-select bg color when country changes
  useEffect(() => {
    setBgColor(docSpec.bgColor);
  }, [docSpec.bgColor, setBgColor]);

  // Ensure valid documentType when country changes
  useEffect(() => {
    if (!selectedSpec.documents.some((d) => d.type === documentType)) {
      setDocumentType(selectedSpec.documents[0].type);
    }
  }, [selectedSpec, documentType, setDocumentType]);

  // Analyze
  const runAnalyze = useCallback(
    async (file: File) => {
      setAnalyzing(true);
      setAnalyzeError(null);
      setAnalyzeResult(null);
      setGenerateResult(null);
      usePassportPhotoStore.setState({ adjustX: 0, adjustY: 0 });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("settings", JSON.stringify({}));

        const headers = formatHeaders();
        const response = await fetch("/api/v1/tools/passport-photo/analyze", {
          method: "POST",
          headers,
          body: formData,
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const msg = body
            ? typeof body.details === "string"
              ? body.details
              : typeof body.error === "string"
                ? body.error
                : `Analysis failed: ${response.status}`
            : `Analysis failed: ${response.status}`;
          throw new Error(msg);
        }

        const result = await response.json();
        setAnalyzeResult(result);
      } catch (err) {
        setAnalyzeError(err instanceof Error ? err.message : "Face analysis failed");
      } finally {
        setAnalyzing(false);
      }
    },
    [setAnalyzing, setAnalyzeResult, setGenerateResult],
  );

  // Auto-analyze when files change
  const analyzeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasFile || analyzeResult || analyzing) return;
    const file = files[0];
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    if (analyzeRef.current === fileKey) return;
    analyzeRef.current = fileKey;
    runAnalyze(file);
  }, [hasFile, files, analyzeResult, analyzing, runAnalyze]);

  // Generate
  const handleGenerate = useCallback(async () => {
    if (!analyzeResult) return;

    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);

    try {
      const headers = formatHeaders({ "Content-Type": "application/json" });
      const body: Record<string, unknown> = {
        jobId: analyzeResult.jobId,
        filename: analyzeResult.filename,
        countryCode: isCustom ? "US" : countryCode,
        documentType,
        bgColor,
        maxFileSizeKb,
        dpi,
        zoom,
        adjustX,
        adjustY,
        landmarks: analyzeResult.landmarks,
        ...(isCustom && customWidthMm ? { customWidthMm } : {}),
        ...(isCustom && customHeightMm ? { customHeightMm } : {}),
        imageWidth: analyzeResult.imageWidth,
        imageHeight: analyzeResult.imageHeight,
      };

      const response = await fetch("/api/v1/tools/passport-photo/generate", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        const msg = errBody
          ? typeof errBody.details === "string"
            ? errBody.details
            : typeof errBody.error === "string"
              ? errBody.error
              : `Generation failed: ${response.status}`
          : `Generation failed: ${response.status}`;
        throw new Error(msg);
      }

      const result: GenerateResult = await response.json();
      setGenerateResult(result);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Photo generation failed");
    } finally {
      setGenerating(false);
    }
  }, [
    analyzeResult,
    countryCode,
    documentType,
    bgColor,
    maxFileSizeKb,
    dpi,
    zoom,
    isCustom,
    customWidthMm,
    customHeightMm,
    adjustX,
    adjustY,
    setGenerating,
    setGenerateResult,
  ]);

  // Filtered countries
  const filteredSpecs = searchQuery
    ? PASSPORT_SPECS.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.code.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : null;

  const regionGroups = groupByRegion();

  return (
    <div className="space-y-4">
      {/* Country selector */}
      <SectionLabel>Country</SectionLabel>
      <div ref={dropdownRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => {
            if (!dropdownOpen && buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
            }
            setDropdownOpen(!dropdownOpen);
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground hover:border-primary/50 transition-colors"
        >
          <span>{selectedSpec.flag}</span>
          <span className="flex-1 text-left truncate">
            {selectedSpec.name}
            <span className="text-muted-foreground ml-1.5 text-xs">
              {formatDimensions(docSpec)}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {dropdownOpen && (
          <div
            className="fixed max-h-64 overflow-auto rounded-lg border border-border shadow-xl bg-background"
            style={{
              zIndex: 9999,
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
          >
            {/* Search input */}
            <div className="sticky top-0 p-2 border-b border-border bg-background">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={(el) => el?.focus()}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search countries..."
                  className="w-full pl-7 pr-2 py-1.5 rounded border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Country list */}
            <div className="py-1">
              {/* Custom option */}
              {!filteredSpecs && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomDimensions(customWidthMm ?? 35, customHeightMm ?? 45);
                    setDropdownOpen(false);
                    setSearchQuery("");
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors border-b border-border ${
                    isCustom ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span>{"\u2699\uFE0F"}</span>
                  <span className="flex-1 text-left">Custom Dimensions</span>
                  {isCustom && <Check className="h-3 w-3 text-primary shrink-0" />}
                </button>
              )}

              {filteredSpecs ? (
                filteredSpecs.length > 0 ? (
                  filteredSpecs.map((spec) => (
                    <CountryOption
                      key={spec.code}
                      spec={spec}
                      selected={spec.code === countryCode}
                      onSelect={() => {
                        setCountryCode(spec.code);
                        setDropdownOpen(false);
                        setSearchQuery("");
                      }}
                    />
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No countries found</p>
                )
              ) : (
                REGION_ORDER.map((region) => {
                  const specs = regionGroups.get(region);
                  if (!specs || specs.length === 0) return null;
                  return (
                    <div key={region}>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {REGION_LABELS[region]}
                      </p>
                      {specs.map((spec) => (
                        <CountryOption
                          key={spec.code}
                          spec={spec}
                          selected={spec.code === countryCode}
                          onSelect={() => {
                            setCountryCode(spec.code);
                            setDropdownOpen(false);
                            setSearchQuery("");
                          }}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Document type toggle */}
      {uniqueDocTypes.length > 1 && (
        <>
          <SectionLabel>Document Type</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {uniqueDocTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDocumentType(type)}
                className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors capitalize ${
                  documentType === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Custom dimensions input */}
      {isCustom && (
        <>
          <SectionLabel>Dimensions (mm)</SectionLabel>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={customWInput || String(customWidthMm ?? 35)}
              onChange={(e) => {
                setCustomWInput(e.target.value);
                const v = Number.parseInt(e.target.value, 10);
                if (v > 0) setCustomDimensions(v, customHeightMm ?? 45);
              }}
              placeholder="Width"
              min="10"
              max="200"
              className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-xs text-foreground"
            />
            <span className="text-muted-foreground text-xs">{"\u00D7"}</span>
            <input
              type="number"
              value={customHInput || String(customHeightMm ?? 45)}
              onChange={(e) => {
                setCustomHInput(e.target.value);
                const v = Number.parseInt(e.target.value, 10);
                if (v > 0) setCustomDimensions(customWidthMm ?? 35, v);
              }}
              placeholder="Height"
              min="10"
              max="200"
              className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-xs text-foreground"
            />
            <span className="text-muted-foreground text-xs">mm</span>
          </div>
        </>
      )}

      {/* DPI */}
      <SectionLabel>DPI</SectionLabel>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={dpi}
          onChange={(e) => {
            const v = Number.parseInt(e.target.value, 10);
            if (v >= 72 && v <= 600) setDpi(v);
          }}
          min="72"
          max="600"
          className="w-20 px-2 py-1.5 rounded border border-border bg-background text-xs text-foreground"
        />
        <span className="text-xs text-muted-foreground">pixels per inch</span>
      </div>

      {/* Background color */}
      <SectionLabel>Background Color</SectionLabel>
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {COMMON_BG_COLORS.map(({ color, label }) => (
            <button
              key={color}
              type="button"
              onClick={() => setBgColor(color)}
              className={`w-7 h-7 rounded border-2 transition-all ${
                bgColor === color ? "border-primary scale-110" : "border-border"
              }`}
              style={{ backgroundColor: color }}
              title={label}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="w-7 h-7 rounded border border-border cursor-pointer"
          />
          <input
            type="text"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            placeholder="#FFFFFF"
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground"
          />
        </div>
      </div>

      {/* File size limit */}
      <SectionLabel>Max File Size</SectionLabel>
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {FILE_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                setMaxFileSizeKb(preset.value);
                setCustomSizeInput("");
              }}
              className={`py-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                maxFileSizeKb === preset.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={customSizeInput}
            onChange={(e) => {
              setCustomSizeInput(e.target.value);
              const val = Number.parseInt(e.target.value, 10);
              if (val > 0) setMaxFileSizeKb(val);
            }}
            placeholder="Custom KB..."
            min="10"
            className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground"
          />
          <span className="text-xs text-muted-foreground">KB</span>
        </div>
      </div>

      {/* Spec info bar */}
      <div className="text-[11px] text-muted-foreground space-y-0.5 bg-muted/50 rounded-lg px-3 py-2">
        <p className="font-medium text-foreground">{docSpec.label}</p>
        <p>
          {docSpec.width}x{docSpec.height}mm ({pxDims.w}x{pxDims.h}px) at {docSpec.dpi} DPI
        </p>
        {maxFileSizeKb > 0 && <p>Max file size: {maxFileSizeKb} KB</p>}
      </div>

      {/* Errors */}
      {analyzeError && <p className="text-xs text-red-500">{analyzeError}</p>}
      {generateError && <p className="text-xs text-red-500">{generateError}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Analyze progress */}
      {analyzing && (
        <ProgressCard
          active
          phase="processing"
          label="Analyzing face"
          stage="Detecting landmarks..."
          percent={50}
          elapsed={0}
        />
      )}

      {/* Generate button */}
      {analyzeResult && !generating && !generateResult && (
        <button
          type="button"
          data-testid="passport-photo-generate"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <UserCheck className="h-4 w-4" />
          Generate Passport Photo
        </button>
      )}

      {/* Generating progress */}
      {generating && (
        <div className="flex items-center justify-center gap-2 py-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating...
        </div>
      )}

      {/* Download button */}
      {generateResult && (
        <a
          href={generateResult.downloadUrl}
          download
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          Download Photo
        </a>
      )}
    </div>
  );
}

// ── Preview panel (right side) ────────────────────────────────────

export function PassportPhotoPreview() {
  const {
    analyzeResult,
    countryCode,
    documentType,
    bgColor,
    dpi,
    customWidthMm,
    customHeightMm,
    adjustX,
    adjustY,
    setAdjustX,
    setAdjustY,
    zoom,
    setZoom,
    analyzing,
    generateResult,
  } = usePassportPhotoStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);

  const docSpec = getDocSpec(countryCode, documentType, customWidthMm, customHeightMm, dpi);
  const pxDims = getPixelDimensions(docSpec);

  // Compliance checks
  const complianceChecks = analyzeResult ? runComplianceChecks(analyzeResult.landmarks) : [];

  // Render canvas
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = previewImgRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !analyzeResult || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { landmarks, imageWidth, imageHeight } = analyzeResult;

    // Use container width to size the canvas, respecting passport aspect ratio
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const aspectRatio = docSpec.width / docSpec.height;

    // Calculate the max canvas size that fits in the container with correct aspect ratio
    let canvasDisplayWidth: number;
    let canvasDisplayHeight: number;

    if (containerWidth / containerHeight > aspectRatio) {
      // Container is wider, constrain by height
      canvasDisplayHeight = Math.min(containerHeight - 40, 700);
      canvasDisplayWidth = Math.round(canvasDisplayHeight * aspectRatio);
    } else {
      // Container is taller, constrain by width
      canvasDisplayWidth = Math.min(containerWidth - 40, 600);
      canvasDisplayHeight = Math.round(canvasDisplayWidth / aspectRatio);
    }

    // Canvas always shows exactly what will be downloaded - no zoom distortion
    canvas.width = canvasDisplayWidth;
    canvas.height = canvasDisplayHeight;

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasDisplayWidth, canvasDisplayHeight);

    // Compute crop region in original image coords
    const crop = computeCropRegion(docSpec, landmarks, imageWidth, imageHeight, adjustX, adjustY);

    // Map crop region from original image coords to preview image coords
    const scaleX = img.naturalWidth / imageWidth;
    const scaleY = img.naturalHeight / imageHeight;

    // When zoom > 1, show a zoomed-in sub-region for visual inspection.
    // The download always uses the full crop (zoom=1).
    const zoomedW = crop.photoWidthPx / zoom;
    const zoomedH = crop.photoHeightPx / zoom;
    const zoomedLeft = crop.leftX + (crop.photoWidthPx - zoomedW) / 2;
    const zoomedTop = crop.topY + (crop.photoHeightPx - zoomedH) / 2;

    const srcX = zoomedLeft * scaleX;
    const srcY = zoomedTop * scaleY;
    const srcW = zoomedW * scaleX;
    const srcH = zoomedH * scaleY;

    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvasDisplayWidth, canvasDisplayHeight);

    // Compliance overlay
    const checks = runComplianceChecks(landmarks);
    const centerOk = checks[0].pass;
    const levelOk = checks[1].pass;

    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;

    // Helper: convert original-image coords to canvas coords (zoom-aware)
    const toCanvasY = (origY: number) => ((origY - zoomedTop) / zoomedH) * canvasDisplayHeight;
    const toCanvasX = (origX: number) => ((origX - zoomedLeft) / zoomedW) * canvasDisplayWidth;

    // Center line (vertical) - face centered check
    const centerXCanvas = toCanvasX((landmarks.faceCenterX + adjustX) * imageWidth);
    ctx.strokeStyle = centerOk ? "#f59e0b" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(centerXCanvas, 0);
    ctx.lineTo(centerXCanvas, canvasDisplayHeight);
    ctx.stroke();

    // Eye-level indicator - line connecting left eye to right eye
    const leftEyeX = toCanvasX((landmarks.leftEye.x + adjustX) * imageWidth);
    const leftEyeY = toCanvasY((landmarks.leftEye.y + adjustY) * imageHeight);
    const rightEyeX = toCanvasX((landmarks.rightEye.x + adjustX) * imageWidth);
    const rightEyeY = toCanvasY((landmarks.rightEye.y + adjustY) * imageHeight);
    ctx.strokeStyle = levelOk ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(leftEyeX, leftEyeY);
    ctx.lineTo(rightEyeX, rightEyeY);
    ctx.stroke();

    ctx.setLineDash([]);
  }, [analyzeResult, docSpec, bgColor, adjustX, adjustY, zoom]);

  // Load preview image when analyzeResult changes
  useEffect(() => {
    if (!analyzeResult?.preview) {
      previewImgRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      previewImgRef.current = img;
      renderCanvas();
    };
    img.src = `data:image/png;base64,${analyzeResult.preview}`;
  }, [analyzeResult?.preview, renderCanvas]);

  // Re-render canvas when settings change
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Re-render on container resize
  useEffect(() => {
    const observer = new ResizeObserver(() => renderCanvas());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [renderCanvas]);

  // Drag to adjust
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!analyzeResult) return;
      setDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY, ax: adjustX, ay: adjustY };
    },
    [analyzeResult, adjustX, adjustY],
  );

  useEffect(() => {
    if (!dragging) return;

    function handleMouseMove(e: MouseEvent) {
      if (!dragStartRef.current) return;
      const dx = (e.clientX - dragStartRef.current.x) * 0.001;
      const dy = (e.clientY - dragStartRef.current.y) * 0.001;
      setAdjustX(Math.max(-0.15, Math.min(0.15, dragStartRef.current.ax - dx)));
      setAdjustY(Math.max(-0.15, Math.min(0.15, dragStartRef.current.ay - dy)));
    }

    function handleMouseUp() {
      setDragging(false);
      dragStartRef.current = null;
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, setAdjustX, setAdjustY]);

  // Wheel zoom (visual inspection only, does not affect download)
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      setZoom(Math.max(0.5, Math.min(3, zoom + (e.deltaY > 0 ? -0.1 : 0.1))));
    },
    [zoom, setZoom],
  );

  // No file / no analysis state
  if (!analyzeResult && !analyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
          <UserCheck className="h-10 w-10 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Upload a portrait photo</p>
          <p className="text-xs text-muted-foreground mt-1">
            Drop or upload an image in the left panel to preview your passport photo
          </p>
        </div>
      </div>
    );
  }

  // Analyzing state
  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
        <div>
          <p className="text-sm font-medium text-foreground">Analyzing photo</p>
          <p className="text-xs text-muted-foreground mt-1">
            Detecting face landmarks and removing background...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center h-full w-full p-4 gap-3">
      {/* Output dimensions */}
      {/* Zoom controls + dimensions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground w-12 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Reset to 100%"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {pxDims.w}x{pxDims.h}px
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground text-center -mt-2">
        What you see is what you download
      </p>

      {/* Canvas preview */}
      <div className="flex-1 flex items-center justify-center overflow-auto min-h-0 w-full">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className={`rounded-lg border border-border shadow-md ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-black/50 text-white text-[10px] px-2 py-1 rounded-md">
              <Move className="h-3 w-3" />
              Drag to adjust
            </div>
            <div className="bg-black/50 text-white text-[10px] px-2 py-1 rounded-md">
              Scroll to zoom
            </div>
          </div>
        </div>
      </div>

      {/* Compliance checklist */}
      {complianceChecks.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 shrink-0 py-2">
          {complianceChecks.map((check) => (
            <div key={check.label} className="flex items-center gap-1.5 text-xs">
              {check.pass ? (
                <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
              )}
              <span className={check.pass ? "text-foreground" : "text-red-400"}>{check.label}</span>
              {!check.pass && (
                <span className="text-muted-foreground text-[10px]">- {check.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Generated result notification */}
      {generateResult && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 px-3 py-2 rounded-lg shrink-0">
          <Check className="h-4 w-4" />
          Photo generated. Download from the left panel.
        </div>
      )}
    </div>
  );
}
