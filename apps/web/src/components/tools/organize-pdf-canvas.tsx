import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SafeError } from "@snapotter/shared";
import { Loader2, RotateCcw } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { useEffect, useState } from "react";
import { DocumentView } from "@/components/tools/document-view";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";
import { useOrganizeStore } from "@/stores/organize-store";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

const THUMB_W = 132;
const THUMB_H = 176;

/**
 * Render every page of a PDF to a small JPEG data URL, one at a time so a long
 * document does not lock the main thread. Pages report back as they finish, so
 * the grid is usable before rendering ends. Returns a cancel fn for unmount.
 */
function renderPageThumbs(
  file: File,
  onCount: (pageCount: number) => void,
  onPage: (pageNumber: number, url: string) => void,
  onFail: () => void,
): () => void {
  let cancelled = false;
  let destroy: (() => unknown) | undefined;

  (async () => {
    let doc: pdfjs.PDFDocumentProxy;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (cancelled) return;
      const loadingTask = pdfjs.getDocument({ data });
      destroy = () => loadingTask.destroy();
      doc = await loadingTask.promise;
    } catch {
      // A document that never opens (corrupt, password-protected) falls back
      // to the plain viewer, which reports the failure on screen, and the
      // settings panel returns to the typed spec. The cleanup's destroy()
      // also lands here, which is why a cancelled load stays quiet.
      if (!cancelled) onFail();
      return;
    }
    if (cancelled) return;
    onCount(doc.numPages);

    // One page failing keeps its numbered placeholder; the pages after it
    // still render, and the order is unaffected because it only needs the
    // count. Report the first failure so a broken render path is visible.
    let reported = false;
    for (let n = 1; n <= doc.numPages && !cancelled; n += 1) {
      try {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(THUMB_W / base.width, THUMB_H / base.height, 2);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({ canvas, viewport }).promise;
        } finally {
          page.cleanup();
        }
        if (!cancelled) onPage(n, canvas.toDataURL("image/jpeg", 0.7));
      } catch (cause) {
        if (cancelled || reported) continue;
        reported = true;
        console.error("organize-pdf: page thumbnail failed to render", cause);
        void captureHandledError(
          new SafeError("Organize PDF page thumbnail failed to render", {
            kind: "operational",
            cause,
          }),
          { error_class: "operational", tool_id: "organize-pdf" },
        );
      }
    }
  })();

  return () => {
    cancelled = true;
    destroy?.();
  };
}

interface PageCardProps {
  pageNumber: number;
  position: number;
  thumb: string | undefined;
  label: string;
}

/** One draggable page tile: the rendered page, its new position, its origin. */
function PageCard({ pageNumber, position, thumb, label }: PageCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pageNumber,
  });

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative rounded-lg border bg-background p-1.5 cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        isDragging
          ? "border-primary shadow-lg z-10 opacity-90"
          : "border-border hover:border-primary/50"
      }`}
      aria-label={label}
      data-testid={`organize-page-${pageNumber}`}
      {...attributes}
      {...listeners}
    >
      <div
        className="flex items-center justify-center rounded bg-muted overflow-hidden"
        style={{ width: THUMB_W, height: THUMB_H }}
      >
        {thumb ? (
          <img src={thumb} alt="" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-lg font-medium text-muted-foreground">{pageNumber}</span>
        )}
      </div>
      <div className="flex items-center justify-between px-0.5 pt-1 text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">{position}</span>
        {position !== pageNumber && <span>&larr; {pageNumber}</span>}
      </div>
    </button>
  );
}

/** Main-area page organizer for the Organize PDF tool. */
export function OrganizePdfCanvas() {
  const { t } = useTranslation();
  const s = t.toolSettings["organize-pdf"];
  const { files } = useFileStore();
  const {
    file: orderedFile,
    pageOrder,
    pageCount,
    setDocument,
    movePage,
    reset,
  } = useOrganizeStore();
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);

  const file = files[0];

  // The order stays in the store when this grid unmounts for the result view,
  // so coming back to the same file keeps the arrangement. The settings panel
  // only trusts an order whose file matches the one loaded now.
  useEffect(() => {
    if (!file) return;
    setThumbs({});
    setFailed(false);
    return renderPageThumbs(
      file,
      (count) => setDocument(file, count),
      (n, url) => setThumbs((prev) => ({ ...prev, [n]: url })),
      () => setFailed(true),
    );
  }, [file, setDocument]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    movePage(pageOrder.indexOf(Number(active.id)), pageOrder.indexOf(Number(over.id)));
  };

  if (failed) return <DocumentView />;

  if (!pageCount || orderedFile !== file) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin me-2" />
        {t.common.loading}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border">
        <p className="text-xs text-muted-foreground">{s.dragHint}</p>
        <button
          type="button"
          onClick={reset}
          disabled={pageOrder.every((page, i) => page === i + 1)}
          data-testid="organize-reset"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="h-3 w-3" />
          {s.resetOrder}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pageOrder} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-3">
              {pageOrder.map((pageNumber, i) => (
                <PageCard
                  key={pageNumber}
                  pageNumber={pageNumber}
                  position={i + 1}
                  thumb={thumbs[pageNumber]}
                  label={format(s.pageLabel, { n: pageNumber })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
