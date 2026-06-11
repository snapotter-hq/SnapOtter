import * as pdfjs from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

/** pdf.js canvas viewer for the document display mode (spec 4.6). */
export function DocumentView() {
  const { t } = useTranslation();
  const entry = useFileStore((s) => s.entries[s.selectedIndex]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const src = entry?.processedUrl ?? entry?.blobUrl;

  useEffect(() => {
    if (!src || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await pdfjs.getDocument({ url: src }).promise;
        if (cancelled) return;
        setPageCount(doc.numPages);
        const pdfPage = await doc.getPage(Math.min(page, doc.numPages));
        const viewport = pdfPage.getViewport({ scale: 1.2 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pdfPage.render({ canvas, viewport }).promise;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, page]);

  if (!entry) return null;
  if (error)
    return <p className="p-4 text-sm text-destructive">{t.tools.documentView.loadFailed}</p>;
  return (
    <div className="flex h-full w-full flex-col items-center gap-2 overflow-auto p-4">
      <canvas ref={canvasRef} className="max-w-full rounded border" data-testid="document-canvas" />
      {pageCount > 1 && (
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
