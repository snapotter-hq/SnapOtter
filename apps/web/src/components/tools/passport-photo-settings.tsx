import {
  PASSPORT_SPECS,
  type PassportDocumentSpec,
  type PassportRegion,
  type PassportSpec,
  PRINT_LAYOUTS,
} from "@stirling-image/shared";
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Move,
  Printer,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  printDownloadUrl?: string;
  dimensions: { width: number; height: number };
  spec: { country: string; document: string };
}

interface ComplianceCheck {
  label: string;
  pass: boolean;
}

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

// ── Section label (matches codebase pattern) ───────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

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

function runComplianceChecks(
  doc: PassportDocumentSpec,
  landmarks: FaceLandmarks,
  imageHeight: number,
  adjustY: number,
): ComplianceCheck[] {
  const crownYPx = (landmarks.crown.y + adjustY) * imageHeight;
  const chinYPx = (landmarks.chin.y + adjustY) * imageHeight;
  const headHeightPx = chinYPx - crownYPx;
  const targetHeadRatio = (doc.headHeightMin + doc.headHeightMax) / 2;
  const photoHeightPx = headHeightPx / targetHeadRatio;

  const headFraction = headHeightPx / photoHeightPx;
  const headOk = headFraction >= doc.headHeightMin && headFraction <= doc.headHeightMax;

  const eyeYPx = (landmarks.eyeCenter.y + adjustY) * imageHeight;
  const topY = eyeYPx - photoHeightPx * (1 - doc.eyeLineFromBottom);
  const eyeFromBottom = 1 - (eyeYPx - topY) / photoHeightPx;
  const eyeTolerance = 0.05;
  const eyeOk =
    eyeFromBottom >= doc.eyeLineFromBottom - eyeTolerance &&
    eyeFromBottom <= doc.eyeLineFromBottom + eyeTolerance;

  const centerOk = Math.abs(landmarks.faceCenterX - 0.5) < 0.08;

  return [
    { label: "Head height", pass: headOk },
    { label: "Eye position", pass: eyeOk },
    { label: "Face centered", pass: centerOk },
  ];
}

// ── Main component ─────────────────────────────────────────────────

export function PassportPhotoSettings() {
  const { files } = useFileStore();
  const { error } = useToolProcessor("passport-photo");

  // Settings
  const [countryCode, setCountryCode] = useState("US");
  const [documentType, setDocumentType] = useState("passport");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [printLayout, setPrintLayout] = useState("4x6");

  // Country search
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Drag adjustment
  const [adjustX, setAdjustX] = useState(0);
  const [adjustY, setAdjustY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);

  // Analysis result
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Generate result
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);

  // ── Derived state ─────────────────────────────────────────────

  const selectedSpec = PASSPORT_SPECS.find((s) => s.code === countryCode) ?? PASSPORT_SPECS[0];
  const docSpec =
    selectedSpec.documents.find((d) => d.type === documentType) ?? selectedSpec.documents[0];
  const hasFile = files.length > 0;

  // Available doc types for selected country
  const docTypes = selectedSpec.documents.map((d) => d.type);
  const uniqueDocTypes = [...new Set(docTypes)];

  // ── Close dropdown on outside click ────────────────────────────

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

  // ── Auto-select bg color when country changes ──────────────────

  useEffect(() => {
    setBgColor(docSpec.bgColor);
  }, [docSpec.bgColor]);

  // ── Ensure valid documentType when country changes ─────────────

  useEffect(() => {
    if (!selectedSpec.documents.some((d) => d.type === documentType)) {
      setDocumentType(selectedSpec.documents[0].type);
    }
  }, [selectedSpec, documentType]);

  // ── Analyze ────────────────────────────────────────────────────

  const runAnalyze = useCallback(async (file: File) => {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeResult(null);
    setGenerateResult(null);
    setAdjustX(0);
    setAdjustY(0);

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
        throw new Error(body?.details || body?.error || `Analysis failed: ${response.status}`);
      }

      const result = await response.json();
      setAnalyzeResult(result);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Face analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  // ── Auto-analyze when files change ─────────────────────────────

  const analyzeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasFile || analyzeResult || analyzing) return;
    const file = files[0];
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    if (analyzeRef.current === fileKey) return;
    analyzeRef.current = fileKey;
    runAnalyze(file);
  }, [hasFile, files, analyzeResult, analyzing, runAnalyze]);

  // ── Render canvas ──────────────────────────────────────────────

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = previewImgRef.current;
    if (!canvas || !img || !analyzeResult) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { landmarks, imageWidth, imageHeight } = analyzeResult;

    // Canvas display size - use doc spec aspect ratio
    const canvasDisplayWidth = 280;
    const canvasDisplayHeight = canvasDisplayWidth * (docSpec.height / docSpec.width);
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
    const srcX = crop.leftX * scaleX;
    const srcY = crop.topY * scaleY;
    const srcW = crop.photoWidthPx * scaleX;
    const srcH = crop.photoHeightPx * scaleY;

    // Draw preview image, cropped, onto full canvas
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvasDisplayWidth, canvasDisplayHeight);

    // ── Compliance overlay ────────────────────────────────────────

    const checks = runComplianceChecks(docSpec, landmarks, imageHeight, adjustY);
    const headOk = checks[0].pass;
    const eyeOk = checks[1].pass;
    const centerOk = checks[2].pass;

    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;

    // Crown line (top of head)
    const crownYCanvas =
      ((landmarks.crown.y + adjustY) * imageHeight - crop.topY) *
      (canvasDisplayHeight / crop.photoHeightPx);
    ctx.strokeStyle = headOk ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(0, crownYCanvas);
    ctx.lineTo(canvasDisplayWidth, crownYCanvas);
    ctx.stroke();

    // Chin line
    const chinYCanvas =
      ((landmarks.chin.y + adjustY) * imageHeight - crop.topY) *
      (canvasDisplayHeight / crop.photoHeightPx);
    ctx.strokeStyle = headOk ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(0, chinYCanvas);
    ctx.lineTo(canvasDisplayWidth, chinYCanvas);
    ctx.stroke();

    // Eye line
    const eyeYCanvas =
      ((landmarks.eyeCenter.y + adjustY) * imageHeight - crop.topY) *
      (canvasDisplayHeight / crop.photoHeightPx);
    ctx.strokeStyle = eyeOk ? "#3b82f6" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(0, eyeYCanvas);
    ctx.lineTo(canvasDisplayWidth, eyeYCanvas);
    ctx.stroke();

    // Center line (vertical)
    const centerXCanvas =
      ((landmarks.faceCenterX + adjustX) * imageWidth - crop.leftX) *
      (canvasDisplayWidth / crop.photoWidthPx);
    ctx.strokeStyle = centerOk ? "#f59e0b" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(centerXCanvas, 0);
    ctx.lineTo(centerXCanvas, canvasDisplayHeight);
    ctx.stroke();

    ctx.setLineDash([]);
  }, [analyzeResult, docSpec, bgColor, adjustX, adjustY]);

  // ── Load preview image when analyzeResult changes ──────────────

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

  // ── Drag to adjust ─────────────────────────────────────────────

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
  }, [dragging]);

  // ── Generate ───────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!analyzeResult) return;

    setGenerating(true);
    setGenerateError(null);
    setGenerateResult(null);

    try {
      const headers = formatHeaders({ "Content-Type": "application/json" });
      const body = {
        jobId: analyzeResult.jobId,
        filename: analyzeResult.filename,
        countryCode,
        documentType,
        bgColor,
        printLayout,
        adjustX,
        adjustY,
        landmarks: analyzeResult.landmarks,
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
        throw new Error(
          errBody?.details || errBody?.error || `Generation failed: ${response.status}`,
        );
      }

      const result: GenerateResult = await response.json();
      setGenerateResult(result);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Photo generation failed");
    } finally {
      setGenerating(false);
    }
  }, [analyzeResult, countryCode, documentType, bgColor, printLayout, adjustX, adjustY]);

  // ── Compliance checks ──────────────────────────────────────────

  const complianceChecks = analyzeResult
    ? runComplianceChecks(docSpec, analyzeResult.landmarks, analyzeResult.imageHeight, adjustY)
    : [];

  // ── Filtered countries ─────────────────────────────────────────

  const filteredSpecs = searchQuery
    ? PASSPORT_SPECS.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.code.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : null;

  const regionGroups = groupByRegion();

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Country selector */}
      <SectionLabel>Country</SectionLabel>
      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground hover:border-primary/50 transition-colors"
        >
          <span>{selectedSpec.flag}</span>
          <span className="flex-1 text-left truncate">{selectedSpec.name}</span>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>

        {dropdownOpen && (
          <div className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-border bg-popover shadow-lg">
            {/* Search input */}
            <div className="sticky top-0 bg-popover p-2 border-b border-border">
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
              {filteredSpecs ? (
                // Search results (flat list)
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
                // Grouped by region
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

      {/* Background color */}
      <SectionLabel>Background Color</SectionLabel>
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {docSpec.bgColors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setBgColor(color)}
              className={`w-7 h-7 rounded border-2 transition-all ${
                bgColor === color ? "border-primary scale-110" : "border-border"
              }`}
              style={{ backgroundColor: color }}
              title={color}
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

      {/* Print layout */}
      <SectionLabel>Print Layout</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {PRINT_LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            onClick={() => setPrintLayout(layout.id)}
            className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
              printLayout === layout.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {layout.label}
          </button>
        ))}
      </div>

      {/* Spec info */}
      <div className="text-[11px] text-muted-foreground space-y-0.5 bg-muted/50 rounded-lg px-3 py-2">
        <p>
          {docSpec.label}: {docSpec.width}x{docSpec.height}mm at {docSpec.dpi} DPI
        </p>
      </div>

      {/* Canvas preview */}
      {analyzeResult && (
        <div className="space-y-2">
          <SectionLabel>Preview</SectionLabel>
          <div className="flex justify-center">
            <div className="relative">
              <canvas
                ref={canvasRef}
                className={`rounded-lg border border-border shadow-sm ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                onMouseDown={handleMouseDown}
              />
              {/* Drag hint */}
              <div className="absolute bottom-1 right-1 flex items-center gap-1 bg-black/50 text-white text-[9px] px-1.5 py-0.5 rounded">
                <Move className="h-2.5 w-2.5" />
                Drag to adjust
              </div>
            </div>
          </div>

          {/* Compliance checklist */}
          <div className="space-y-1">
            <SectionLabel>Compliance</SectionLabel>
            {complianceChecks.map((check) => (
              <div key={check.label} className="flex items-center gap-2 text-xs">
                {check.pass ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <X className="h-3.5 w-3.5 text-red-500" />
                )}
                <span className={check.pass ? "text-foreground" : "text-red-400"}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Download buttons */}
      {generateResult && (
        <div className="space-y-2">
          <a
            href={generateResult.downloadUrl}
            download
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Download Photo
          </a>
          {generateResult.printDownloadUrl && printLayout !== "none" && (
            <a
              href={generateResult.printDownloadUrl}
              download
              className="w-full py-2 rounded-lg border border-border text-foreground font-medium text-sm flex items-center justify-center gap-2 hover:bg-muted/50"
            >
              <Printer className="h-4 w-4" />
              Download Print Sheet
            </a>
          )}
        </div>
      )}
    </div>
  );
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
      <span className="text-muted-foreground">{spec.code}</span>
      {selected && <Check className="h-3 w-3 text-primary" />}
    </button>
  );
}
