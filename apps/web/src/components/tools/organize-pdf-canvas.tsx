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
import { Loader2, RotateCcw } from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { useEffect, useState } from "react";
import { DocumentView } from "@/components/tools/document-view";
import { useTranslation } from "@/contexts/i18n-context";
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
  let opened = false;
  let destroy: (() => unknown) | undefined;

  (async () => {
    try {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      destroy = () => loadingTask.destroy();
      const doc = await loadingTask.promise;
      if (cancelled) return;
      opened = true;
      onCount(doc.numPages);

      for (let n = 1; n <= doc.numPages && !cancelled; n += 1) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(THUMB_W / base.width, THUMB_H / base.height, 2);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        if (!cancelled) onPage(n, canvas.toDataURL("image/jpeg", 0.7));
        page.cleanup();
      }
    } catch {
      // Pages that fail after the document opens keep their numbered
      // placeholders and still reorder. Only a document that never opens
      // falls back to the plain viewer and the typed spec.
      if (!cancelled && !opened) onFail();
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
  const { pageOrder, pageCount, setDocument, movePage, reset, clear } = useOrganizeStore();
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);

  const file = files[0];

  useEffect(() => {
    if (!file) return;
    setThumbs({});
    setFailed(false);
    const cancel = renderPageThumbs(
      file,
      setDocument,
      (n, url) => setThumbs((prev) => ({ ...prev, [n]: url })),
      () => setFailed(true),
    );
    // Clearing on the way out stops the settings panel from submitting the
    // previous document's order while the next one is still loading.
    return () => {
      cancel();
      clear();
    };
  }, [file, setDocument, clear]);

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

  if (!pageCount) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
