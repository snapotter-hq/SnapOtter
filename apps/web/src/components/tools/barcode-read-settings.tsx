import type { TranslationKeys } from "@snapotter/shared";
import { Check, Copy, Download, Search } from "lucide-react";
import { useRef, useState } from "react";
import { ProgressCard } from "@/components/common/progress-card";
import { useTranslation } from "@/contexts/i18n-context";
import { useTimeouts } from "@/hooks/use-timeouts";
import { formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";
import { format, plural } from "@/lib/format";
import {
  jobFailureMessage,
  MalformedResultError,
  reportMalformedResult,
} from "@/lib/progress-frames";
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
    return "bg-primary/15 text-primary-ink";
  if (type.includes("EAN") || type.includes("UPC") || type.includes("DataBar"))
    return "bg-green-500/15 text-success-ink";
  if (type === "PDF417") return "bg-purple-500/15 text-purple-600 dark:text-purple-400";
  return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pt-1">
      {children}
    </p>
  );
}

/** A sync 2xx answer from the barcode-read route. */
interface BarcodeReadAnswer {
  filename: string;
  barcodes: BarcodeResult[];
  /** The annotated image, or null when nothing was found. */
  annotatedUrl: string | null;
}

function isBarcode(value: unknown): value is BarcodeResult {
  if (value === null || typeof value !== "object") return false;
  const { type, text } = value as { type?: unknown; text?: unknown };
  return typeof type === "string" && typeof text === "string";
}

/**
 * Parses a sync 2xx barcode-read answer. The route answers with decoded
 * barcodes and no downloadUrl, so parseResultBody would turn every good answer
 * away; this checks the fields the panel reads instead and throws a
 * MalformedResultError otherwise (#1795). Nothing of the body goes into the
 * error: a JSON SyntaxError quotes it.
 */
function parseBarcodeAnswer(text: string): BarcodeReadAnswer {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MalformedResultError("notAnObject");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new MalformedResultError("notAnObject");
  }
  const { filename, barcodes, annotatedUrl } = body as Record<string, unknown>;
  if (
    typeof filename !== "string" ||
    !Array.isArray(barcodes) ||
    !barcodes.every(isBarcode) ||
    !(annotatedUrl === null || (typeof annotatedUrl === "string" && annotatedUrl))
  ) {
    throw new MalformedResultError("notABarcodeResult");
  }
  return resolveServerUrls(body as BarcodeReadAnswer);
}

/**
 * Send one file to the barcode-read API and hand a good answer to `land`. Only
 * an answer that isn't one is the server's fault, and it gets reported
 * (#1740). A throw from `land` is our own store write failing: it fails the
 * file with the tracking message and is rethrown so it still surfaces (#1795,
 * after #1354).
 */
function scanOneFile(
  file: File,
  tryHarder: boolean,
  onUploadProgress: (pct: number) => void,
  land: (answer: BarcodeReadAnswer) => void,
  t: TranslationKeys,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("settings", JSON.stringify({ tryHarder }));

    const xhr = new XMLHttpRequest();
    xhr.timeout = 300_000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress((e.loaded / e.total) * 100);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let answer: BarcodeReadAnswer;
        try {
          answer = parseBarcodeAnswer(xhr.responseText);
        } catch (err) {
          reject(new Error(t.errors.invalidResponse));
          reportMalformedResult(err, { status: xhr.status, toolId: "barcode-read" });
          return;
        }
        try {
          land(answer);
        } catch (err) {
          reject(new Error(jobFailureMessage({ reason: "trackingFailed" }, t.errors)));
          throw err;
        }
        resolve();
      } else {
        try {
          const body = JSON.parse(xhr.responseText);
          reject(
            new Error(body.error || format(t.errors.failedWithStatus, { status: xhr.status })),
          );
        } catch {
          reject(
            new Error(
              format(t.toolSettings["barcode-read"].scanningFailedWithStatus, {
                status: xhr.status,
              }),
            ),
          );
        }
      }
    };
    xhr.onerror = () => reject(new Error(t.errors.network));
    xhr.ontimeout = () => reject(new Error(t.errors.requestTimedOut));

    xhr.open("POST", appUrl("/api/v1/tools/image/barcode-read"));
    for (const [key, value] of formatHeaders()) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(formData);
  });
}

export function BarcodeReadSettings() {
  const { t } = useTranslation();
  const { files, processing, error, setProcessing, setError } = useFileStore();

  const [tryHarder, setTryHarder] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const later = useTimeouts();
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
        setProgressStage(
          `${prefix}${format(t.toolSettings["barcode-read"].scanningFile, { name: file.name })}`,
        );

        await scanOneFile(
          file,
          tryHarder,
          (pct) => {
            setProgressPhase("uploading");
            setProgressPercent(fileBase + (pct / 100) * fileShare * 0.5);
          },
          (answer) => {
            setProgressPhase("processing");
            setProgressPercent(fileBase + fileShare);

            allResults.push({
              filename: answer.filename,
              barcodes: answer.barcodes,
            });

            // Set annotated image as processedUrl for before/after view
            if (answer.annotatedUrl) {
              updateEntry(i, {
                processedUrl: answer.annotatedUrl,
                processedPreviewUrl: answer.annotatedUrl,
                processedFilename: `annotated-${file.name.replace(/\.[^.]+$/, "")}.png`,
                status: "completed",
                processedSize: null,
              });
            }
          },
          t,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.name}: ${msg}`);
        // A throw while landing comes after this file's barcodes went in.
        if (allResults.length === i) allResults.push({ filename: file.name, barcodes: [] });
      }
    }

    if (elapsedRef.current) clearInterval(elapsedRef.current);

    if (errors.length === total) {
      setError(errors.join("; "));
    } else if (errors.length > 0) {
      setError(format(t.toolSettings["barcode-read"].filesFailed, { count: errors.length, total }));
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
      later(() => setCopiedIndex(null), 1500, "copiedIndex");
    }
  };

  const handleCopyAll = async () => {
    const allText = results
      .flatMap((r) => r.barcodes.map((b) => `${FORMAT_LABELS[b.type] ?? b.type}: ${b.text}`))
      .join("\n");
    const ok = await copyToClipboard(allText);
    if (ok) {
      setCopiedAll(true);
      later(() => setCopiedAll(false), 2000, "copiedAll");
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
        {t.toolSettings["barcode-read"].scanImagesForQrCodes}
      </p>

      {/* Thorough scan toggle */}
      <SectionLabel>{t.toolSettings["barcode-read"].options}</SectionLabel>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={tryHarder}
          onChange={(e) => setTryHarder(e.target.checked)}
          className="rounded border-border accent-primary"
        />
        <span className="text-sm text-muted-foreground">
          {t.toolSettings["barcode-read"].thoroughScan}
        </span>
        <span
          title={t.toolSettings["barcode-read"].spendsMoreTimeAnalyzingThe}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground/40 text-muted-foreground text-[10px] cursor-help"
        >
          ?
        </span>
      </label>

      {/* Error */}
      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      {/* Process button / progress */}
      {processing ? (
        <ProgressCard
          active={processing}
          phase={progressPhase === "idle" ? "uploading" : progressPhase}
          label={t.toolSettings["barcode-read"].scanningForBarcodes}
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
          {files.length > 1
            ? format(t.toolSettings["barcode-read"].scanBarcodesBatch, { count: files.length })
            : t.toolSettings["barcode-read"].submit}
        </button>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          {/* Summary badge */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {totalBarcodes === 0
                ? t.toolSettings["barcode-read"].noBarcodesFound
                : plural(
                    totalBarcodes,
                    format(t.toolSettings["barcode-read"].foundBarcode, { count: totalBarcodes }),
                    format(t.toolSettings["barcode-read"].foundBarcodePlural, {
                      count: totalBarcodes,
                    }),
                  )}
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
                  {copiedAll
                    ? t.toolSettings["barcode-read"].copied
                    : t.toolSettings["barcode-read"].copyAll}
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
                <p className="text-xs text-muted-foreground italic py-1">
                  {t.toolSettings["barcode-read"].noBarcodesFound}
                </p>
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
                        className="shrink-0 p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity"
                        title={t.toolSettings["barcode-read"].copyValue}
                      >
                        {copiedIndex === idx ? (
                          <Check className="h-3.5 w-3.5 text-success-ink" />
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
