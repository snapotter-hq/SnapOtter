import { Copy, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { DocumentView } from "./document-view";

/**
 * Results panel for the OCR PDF tool: the original PDF on one side and the
 * extracted text on the other. The tool's output is a .txt transcript, so the
 * PDF preview is forced to the input (inputOnly) and the text is fetched from
 * the processed download URL once OCR completes.
 */
export function OcrPdfView() {
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const processedUrl = entry?.processedUrl ?? null;
  const status = entry?.status;

  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!processedUrl) {
      setText(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(processedUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setText(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processedUrl]);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-3 lg:flex-row">
      {/* Original PDF */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <DocumentView inputOnly />
      </div>

      {/* Extracted text */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Extracted Text</span>
          {text != null && (
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading extracted text...</p>
          ) : text != null ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
              {text || "(no text found)"}
            </pre>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <p className="max-w-xs text-sm text-muted-foreground">
                {status === "processing"
                  ? "Extracting text..."
                  : "The extracted text will appear here after you run OCR."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
