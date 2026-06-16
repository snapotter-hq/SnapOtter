import { FileText } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

/** pdf.js canvas viewer for the document display mode (spec 4.6). */
export function DocumentView({ inputOnly = false }: { inputOnly?: boolean } = {}) {
  const { t } = useTranslation();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // inputOnly keeps the original input on screen for tools whose output is not
  // a previewable PDF (e.g. ocr-pdf, whose output is a .txt transcript).
  const hasProcessedUrl = !inputOnly && !!entry?.processedUrl;
  const src = inputOnly ? entry?.blobUrl : (entry?.processedUrl ?? entry?.blobUrl);

  // F6: detect non-PDF input files (word, excel, html, markdown, etc.)
  const isPdfInput = entry?.file?.name?.toLowerCase().endsWith(".pdf") ?? false;
  const showInputFallback = !isPdfInput && !hasProcessedUrl;

  /* A+B: reset pagination and clear stale errors when the document changes.
     src is intentionally a trigger-only dep (not read inside the callback). */
  // biome-ignore lint/correctness/useExhaustiveDependencies: src is the trigger
  useEffect(() => {
    setPage(1);
    setPageCount(0);
    setError(null);
  }, [src]);

  /* C+D: cancel in-flight renders and destroy the doc proxy on cleanup. */
  useEffect(() => {
    if (!canvasRef.current || showInputFallback) return;
    // F22: when processedUrl is available, use URL-based loading instead of
    // entry.file (which is the original non-PDF input and would fail pdf.js)
    const file = hasProcessedUrl ? undefined : entry?.file;
    if (!file && !src) return;
    let cancelled = false;
    let doc: pdfjs.PDFDocumentProxy | undefined;
    let renderTask: pdfjs.RenderTask | undefined;

    (async () => {
      try {
        const source = file ? { data: new Uint8Array(await file.arrayBuffer()) } : { url: src! };
        doc = await pdfjs.getDocument(source).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale: 1.2 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = pdfPage.render({ canvas, viewport });
        await renderTask.promise;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      doc?.loadingTask.destroy();
    };
  }, [src, page, entry?.file, showInputFallback, hasProcessedUrl]);

  if (!entry) return null;

  // F6: graceful fallback for non-PDF input files
  if (showInputFallback) {
    const ext = entry.file?.name?.split(".").pop()?.toUpperCase() ?? "";
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-2">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        {ext && <p className="text-xs text-muted-foreground">{ext}</p>}
        <p className="text-sm text-muted-foreground text-center">
          {t.tools.documentView.inputNotPreviewable}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center gap-2 overflow-auto p-4">
      {error && <p className="p-4 text-sm text-destructive">{t.tools.documentView.loadFailed}</p>}
      <canvas
        ref={canvasRef}
        className={`max-w-full rounded border${error ? " hidden" : ""}`}
        data-testid="document-canvas"
      />
      {!error && pageCount > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="disabled:opacity-50"
          >
            {t.tools.documentView.previousPage}
          </button>
          <span>
            {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="disabled:opacity-50"
          >
            {t.tools.documentView.nextPage}
          </button>
        </div>
      )}
    </div>
  );
}
