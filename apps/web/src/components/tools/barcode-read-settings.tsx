import { Check, Copy, Download, Search } from "lucide-react";
import { useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { formatHeaders } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { useFileStore } from "@/stores/file-store";

interface BarcodeResult {
  type: string;
  text: string;
  position: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
    bottomRight: { x: number; y: number };
  };
}

interface FileResult {
  filename: string;
  barcodes: BarcodeResult[];
}

/** Human-readable barcode type labels. */
const FORMAT_LABELS: Record<string, string> = {
  QRCode: "QR Code",
  Code128: "Code 128",
  Code39: "Code 39",
  Code93: "Code 93",
  Codabar: "Codabar",
  DataMatrix: "Data Matrix",
  EAN8: "EAN-8",
  EAN13: "EAN-13",
  ITF: "ITF",
  PDF417: "PDF417",
  UPCA: "UPC-A",
  UPCE: "UPC-E",
  Aztec: "Aztec",
  MaxiCode: "MaxiCode",
  MicroQRCode: "Micro QR",
  DataBar: "DataBar",
  DataBarExpanded: "DataBar Exp",
};

/** Badge colors by barcode family. */
function getBadgeColor(type: string): string {
  if (type.includes("QR") || type === "Aztec" || type === "DataMatrix" || type === "MaxiCode")
    return "bg-blue-500/15 text-blue-600 dark:text-blue-400";
  if (type.includes("EAN") || type.includes("UPC") || type.includes("DataBar"))
    return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (type === "PDF417") return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
  return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

/** Send one file to the barcode-read API. */
function scanOneFile(
  file: File,
  tryHarder: boolean,
  onUploadProgress: (pct: number) => void,
): Promise<{ filename: string; barcodes: BarcodeResult[]; annotatedUrl: string | null }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify({ tryHarder }));

    const xhr = new XMLHttpRequest();
    xhr.timeout = 60_000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress((e.loaded / e.total) * 100);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(new Error(body.error || `Failed: ${xhr.status}`));
        } catch {
          reject(new Error(`Scanning failed: ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.ontimeout = () => reject(new Error("Request timed out"));

    xhr.open("POST", "/api/v1/tools/barcode-read");
    for (const [key, value] of formatHeaders()) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(formData);
  });
}

export function BarcodeReadSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [tryHarder, setTryHarder] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [progressPhase, setProgressPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleProcess = async () => {
    if (files.length === 0) return;

    setError(null);
    setResults([]);
    setProcessing(true);
    setProgressPhase("uploading");
    setProgressPercent(0);
    setProgressStage(undefined);
    setElapsed(0);

    const startTime = Date.now();
    elapsedRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const total = files.length;
    const allResults: FileResult[] = [];
    const errors: string[] = [];
    const { updateEntry } = useFileStore.getState();

    for (let i = 0; i < total; i++) {
      const file = files[i];
      const prefix = total > 1 ? `[${i + 1}/${total}] ` : "";
      const fileBase = (i / total) * 100;
      const fileShare = 100 / total;

      try {
        setProgressStage(`${prefix}Scanning ${file.name}...`);

        const result = await scanOneFile(file, tryHarder, (pct) => {
          setProgressPhase("uploading");
          setProgressPercent(fileBase + (pct / 100) * fileShare * 0.5);
        });

        setProgressPhase("processing");
        setProgressPercent(fileBase + fileShare);

        allResults.push({
          filename: result.filename,
          barcodes: result.barcodes,
        });

        // Set annotated image as processedUrl for before/after view
        if (result.annotatedUrl) {
          updateEntry(i, {
            processedUrl: result.annotatedUrl,
            processedPreviewUrl: result.annotatedUrl,
            processedFilename: `annotated-${file.name.replace(/\.[^.]+$/, "")}.png`,
            status: "completed",
            processedSize: null,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.name}: ${msg}`);
        allResults.push({ filename: file.name, barcodes: [] });
      }
    }

    if (elapsedRef.current) clearInterval(elapsedRef.current);

    if (errors.length === total) {
      setError(errors.join("; "));
    } else if (errors.length > 0) {
      setError(`${errors.length} of ${total} files failed`);
    }

    setResults(allResults);
    setProcessing(false);
    setProgressPhase("idle");
  };

  // Total barcode count across all files
  const totalBarcodes = results.reduce((sum, r) => sum + r.barcodes.length, 0);

  const handleCopyOne = async (text: string, globalIdx: number) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedIndex(globalIdx);
      setTimeout(() => setCopiedIndex(null), 1500);
    }
  };

  const handleCopyAll = async () => {
    const allText = results
      .flatMap((r) => r.barcodes.map((b) => `${FORMAT_LABELS[b.type] ?? b.type}: ${b.text}`))
      .join("\n");
    const ok = await copyToClipboard(allText);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleExportCsv = () => {
    const header = "File,Type,Value\n";
    const rows = results
      .flatMap((r) =>
        r.barcodes.map(
          (b) =>
            `"${r.filename.replace(/"/g, '""')}","${FORMAT_LABELS[b.type] ?? b.type}","${b.text.replace(/"/g, '""')}"`,
        ),
      )
      .join("\n");
    const csv = header + rows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "barcode-results.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasFile = files.length > 0;
  let globalIndex = 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Scan images for QR codes, barcodes (Code 128, EAN, UPC, etc.), and 2D codes (DataMatrix,
        PDF417, Aztec).
      </p>

      {/* Thorough scan toggle */}
      <SectionLabel>Options</SectionLabel>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={tryHarder}
          onChange={(e) => setTryHarder(e.target.checked)}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm text-muted-foreground">Thorough scan</span>
        <span
          title="Spends more time analyzing the image. Enable for small, damaged, or low-contrast barcodes."
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/40 text-muted-foreground/60 text-[10px] cursor-help"
        >
          ?
        </span>
      </label>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Process button / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progressPhase === "idle" ? "uploading" : progressPhase}
          label="Scanning for barcodes"
          stage={progressStage}
          percent={progressPercent}
          elapsed={elapsed}
        />
      ) : (
        <button
          type="button"
          data-testid="barcode-read-submit"
          onClick={handleProcess}
          disabled={!hasFile || processing}
          className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Search className="h-4 w-4" />
          {files.length > 1 ? `Scan Barcodes (${files.length} files)` : "Scan Barcodes"}
        </button>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {/* Summary badge */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {totalBarcodes === 0
                ? "No barcodes found"
                : `Found ${totalBarcodes} barcode${totalBarcodes !== 1 ? "s" : ""}`}
            </span>
            {totalBarcodes > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </button>
                <button
                  type="button"
                  onClick={handleCopyAll}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copiedAll ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedAll ? "Copied" : "Copy all"}
                </button>
              </div>
            )}
          </div>

          {/* Per-file results */}
          {results.map((fileResult) => (
            <div key={fileResult.filename} className="space-y-1.5">
              {/* Show filename header only when multiple files */}
              {results.length > 1 && (
                <p className="text-[11px] font-medium text-muted-foreground truncate pt-1">
                  {fileResult.filename}
                </p>
              )}

              {fileResult.barcodes.length === 0 ? (
                <p className="text-xs text-muted-foreground/60 italic py-1">No barcodes found</p>
              ) : (
                fileResult.barcodes.map((barcode) => {
                  const idx = globalIndex++;
                  const label = FORMAT_LABELS[barcode.type] ?? barcode.type;
                  const badgeColor = getBadgeColor(barcode.type);
                  return (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-muted group">
                      {/* Barcode type badge */}
                      <div className="shrink-0 pt-0.5">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${badgeColor}`}
                        >
                          {label}
                        </span>
                      </div>
                      {/* Decoded value */}
                      <p className="flex-1 text-sm text-foreground font-mono break-all leading-relaxed">
                        {barcode.text}
                      </p>
                      {/* Copy button */}
                      <button
                        type="button"
                        onClick={() => handleCopyOne(barcode.text, idx)}
                        className="shrink-0 p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy value"
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
