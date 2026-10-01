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
import { PDF_MULTI_TOOL_LIMITS, SafeError } from "@snapotter/shared";
import {
  Check,
  GripHorizontal,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as pdfjs from "pdfjs-dist";
import { useEffect, useRef } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";
import { type LoadedDoc, THUMB_ZOOM_LEVELS, useMultiToolStore } from "@/stores/multi-tool-store";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

// Tile image area (page portrait); rotated editions swap w/h.
// Thumbnail render resolution (independent of the zoom level: rendered once
// at high resolution, displayed at whatever zoom the user picks).
const THUMB_RENDER_W = 200;
const THUMB_RENDER_H = 266;
// Base DISPLAY sizes at zoom 100% (multiplied by THUMB_ZOOM_LEVELS[scale]).
const THUMB_W = 140;
const THUMB_H = 186;
// Doc-strip mini thumbs.
const STRIP_W = 44;
const STRIP_H = 58;

/**
 * Render a document's pages to small JPEG data URLs one at a time so a long
 * document does not lock the main thread, reporting each page as it finishes.
 * Same shape as organize-pdf's renderer, but per-document and reusable for
 * every document loaded into the session. Returns a cancel fn for unmount.
 */
function renderDocThumbs(
  file: File,
  onCount: (pageCount: number) => void,
  onPage: (pageNumber: number, url: string) => void,
  onFail: () => void,
  existingThumbs: Record<number, string>,
): () => void {
  let cancelled = false;
  let destroy: (() => unknown) | undefined;
  const dispose = () => {
    const cleanup = destroy;
    destroy = undefined;
    return cleanup?.();
  };

  const render = async () => {
    let doc: pdfjs.PDFDocumentProxy;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (cancelled) return;
      const loadingTask = pdfjs.getDocument({ data });
      destroy = () => loadingTask.destroy();
      doc = await loadingTask.promise;
    } catch (cause) {
      if (cancelled) return;
      // Keep the document strip and its remove control available on failure.
      console.error("multi-tool-pdf: document failed to open", cause);
      void captureHandledError(
        new SafeError("Multi-tool document failed to open", { kind: "operational", cause }),
        { error_class: "operational", tool_id: "multi-tool-pdf" },
      );
      onFail();
      return;
    }
    if (cancelled) return;
    onCount(doc.numPages);

    // One page failing keeps its numbered placeholder; the pages after it
    // still render and the plan only needs the count. Report the first
    // failure so a broken render path is visible.
    let reported = false;
    for (let n = 1; n <= doc.numPages && !cancelled; n += 1) {
      if (existingThumbs[n]) continue;
      try {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(THUMB_RENDER_W / base.width, THUMB_RENDER_H / base.height, 2);
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
        console.error("multi-tool-pdf: page thumbnail failed to render", cause);
        void captureHandledError(
          new SafeError("Multi-tool page thumbnail failed to render", {
            kind: "operational",
            cause,
          }),
          { error_class: "operational", tool_id: "multi-tool-pdf" },
        );
      }
    }
  };
  void render().finally(dispose);

  return () => {
    cancelled = true;
    dispose();
  };
}

/**
 * Coalesce a stream of single-page thumbnails into throttled full-record
 * store patches. Without this, a 200+ page document re-renders the whole
 * sortable grid once per page and the canvas is unusable while rendering.
 * `done()` must run exactly once per flusher life to emit trailing thumbs.
 */
function makeThumbFlusher(patch: (thumbs: Record<number, string>) => void) {
  let pending: Record<number, string> | null = null;
  let scheduled: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    if (pending) {
      patch(pending);
      pending = null;
    }
  };
  return {
    add: (pageNumber: number, url: string) => {
      pending = { ...(pending ?? {}), [pageNumber]: url };
      if (!scheduled) scheduled = setTimeout(flush, 250);
    },
    done: flush,
  };
}

interface PlanCardProps {
  /** Stable plan-entry id (the dnd id and the tile key). */
  id: string;
  /** Current output position, shown on the tile. */
  index: number;
  page: number;
  rot: 0 | 90 | 180 | 270;
  thumb: string | undefined;
  label: string;
  /** Thumbnail zoom multiplier (from THUMB_ZOOM_LEVELS). */
  scale: number;
  onRotate: (delta: 90 | -90) => void;
  onRemove: () => void;
}

/** One draggable output tile: the rendered page in its planned rotation. */
function PlanCard({
  id,
  index,
  page,
  rot,
  thumb,
  label,
  scale,
  onRotate,
  onRemove,
}: PlanCardProps) {
  const { t } = useTranslation();
  const s = t.toolSettings["multi-tool-pdf"];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  // Rotating the portrait-thumbnail image inside a box of the swapped
  // dimensions shows the page as it will print, without re-rendering.
  const landscape = rot === 90 || rot === 270;
  const tw = Math.round(THUMB_W * scale);
  const th = Math.round(THUMB_H * scale);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative rounded-lg border bg-background p-1.5 ${
        isDragging ? "border-primary shadow-lg z-10 opacity-90" : "border-border"
      }`}
      data-testid={`multi-tool-page-${index}`}
    >
      <div
        className="relative rounded bg-muted overflow-hidden"
        style={{ width: landscape ? th : tw, height: landscape ? tw : th }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="absolute top-1/2 left-1/2 max-w-none max-h-none object-contain"
            style={{
              width: tw,
              height: th,
              transform: `translate(-50%, -50%) rotate(${rot}deg)`,
            }}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-lg font-medium text-muted-foreground">
            {page}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between px-0.5 pt-1">
        <button
          type="button"
          className="p-1 rounded hover:bg-muted text-muted-foreground font-medium text-[10px]"
          aria-label={label}
          data-testid={`multi-tool-grip-${index}`}
          {...attributes}
          {...listeners}
        >
          <GripHorizontal className="h-3 w-3" />
        </button>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => onRotate(-90)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label={s.rotateLeft}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onRotate(90)}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label={s.rotateRight}
          >
            <RotateCw className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            aria-label={s.removePage}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {/* Drag surface over the thumbnail area only; the control row stays
          clicking through. Non-focusable and non-announced: the grip button
          above carries the keyboard-drag a11y role. */}
      <span
        className="absolute top-1.5 left-1.5 right-1.5 bottom-7 opacity-0 cursor-grab active:cursor-grabbing"
        aria-hidden="true"
        {...listeners}
      />
    </div>
  );
}

/** Thumbnail strip with per-page add and a delete button for one document. */
function DocStrip({ doc, index, scale }: { doc: LoadedDoc; index: number; scale: number }) {
  const { t } = useTranslation();
  const s = t.toolSettings["multi-tool-pdf"];
  const { plan, appendPage, appendDoc, removeDoc } = useMultiToolStore();
  const patchDoc = useMultiToolStore((state) => state.patchDoc);
  const setPrimary = useMultiToolStore((state) => state.setPrimary);
  const removeStoreFile = useFileStore((state) => state.removeFile);
  const inPlan = new Set(plan.filter((p) => p.doc === index).map((p) => p.page));
  // The server rejects plans over the limit, so the add affordances stop at
  // it instead of building an arrangement that can never be submitted.
  const planFull = plan.length >= PDF_MULTI_TOOL_LIMITS.outputPages;
  const allInPlan = doc.pageCount > 0 && inPlan.size >= doc.pageCount;

  // Resolve by stable id at callback time. A React prop/ref can still hold
  // the old index during removal cleanup, when pending thumbs are flushed.
  useEffect(() => {
    const position = () => useMultiToolStore.getState().docs.findIndex((d) => d.id === doc.id);
    const current = useMultiToolStore.getState().docs[position()];
    if (!current || current.failed) return;
    if (current.pageCount > 0 && Object.keys(current.thumbs).length === current.pageCount) return;
    const flusher = makeThumbFlusher((thumbs) => {
      const at = position();
      if (at >= 0) patchDoc(at, { thumbs });
    });
    const cancelRender = renderDocThumbs(
      doc.file,
      (count) => {
        const at = position();
        if (at === 0) setPrimary(doc.file, count);
        else if (at > 0) patchDoc(at, { pageCount: count });
      },
      (n, url) => flusher.add(n, url),
      () => {
        const at = position();
        if (at >= 0) patchDoc(at, { failed: true });
      },
      current.thumbs,
    );
    return () => {
      cancelRender();
      flusher.done();
    };
  }, [doc.id, doc.file, patchDoc, setPrimary]);

  const handleRemoveDoc = () => {
    // Resolve by stable id at click time: the index prop can be stale, and
    // one File can back two documents, so the File can't say which was clicked.
    const files = useFileStore.getState().files;
    const at = removeDoc(doc.id);
    if (at < 0) return;
    // The upload list can briefly run ahead of docs (syncFiles runs in an effect).
    const upload = files[at] === doc.file ? at : files.indexOf(doc.file);
    if (upload >= 0) removeStoreFile(upload);
  };

  const stripW = Math.round(STRIP_W * scale);
  const stripH = Math.round(STRIP_H * scale);

  return (
    <div className="shrink-0 rounded-lg border border-border bg-background p-2 w-[164px]">
      <div className="flex items-center gap-1 mb-1.5 mt-0.5">
        <p
          className="text-[10px] text-muted-foreground truncate flex-1 min-w-0"
          title={doc.file.name}
        >
          {index + 1}. {doc.file.name}
        </p>
        <button
          type="button"
          onClick={handleRemoveDoc}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive-ink shrink-0"
          aria-label={s.removeDoc}
          data-testid={`multi-tool-remove-doc-${index}`}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      {!doc.pageCount && (
        <div className="flex items-center justify-center py-2">
          {doc.failed ? (
            <span className="text-[10px] text-destructive-ink">{s.docFailed}</span>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto pb-1" data-testid={`multi-tool-doc-${index}`}>
        {Array.from({ length: doc.pageCount }, (_, i) => i + 1).map((page) => {
          const thumb = doc.thumbs[page];
          const added = inPlan.has(page);
          return (
            <div key={page} className="relative shrink-0">
              <div
                className="rounded border border-border bg-muted overflow-hidden flex items-center justify-center"
                style={{ width: stripW, height: stripH }}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="max-w-full max-h-full object-contain" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">{page}</span>
                )}
              </div>
              {added && (
                <Check className="absolute bottom-0 left-0 h-3 w-3 bg-background text-primary" />
              )}
              <div className="absolute -top-1 -right-1">
                <button
                  type="button"
                  onClick={() => appendPage(index, page, plan.length - 1)}
                  disabled={planFull}
                  className="h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label={format(s.addPage, { n: page })}
                  data-testid={`multi-tool-add-${index}-${page}`}
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => appendDoc(index)}
          disabled={planFull || doc.pageCount === 0 || allInPlan}
          className="text-[10px] text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {allInPlan ? s.allPages : s.addAll}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {inPlan.size}/{doc.pageCount}
        </span>
      </div>
    </div>
  );
}

/** Main-area page editor for the PDF Multi-Tool. */
export function MultiToolPdfCanvas() {
  const { t } = useTranslation();
  const s = t.toolSettings["multi-tool-pdf"];
  const { files, addFiles, reset: resetFiles, processing } = useFileStore();
  const docs = useMultiToolStore((state) => state.docs);
  const plan = useMultiToolStore((state) => state.plan);
  const syncFiles = useMultiToolStore((state) => state.syncFiles);
  const movePage = useMultiToolStore((state) => state.movePage);
  const removePage = useMultiToolStore((state) => state.removePage);
  const rotatePage = useMultiToolStore((state) => state.rotatePage);
  const resetPlan = useMultiToolStore((state) => state.resetPlan);
  const clear = useMultiToolStore((state) => state.clear);
  const zoomIndex = useMultiToolStore((state) => state.zoomIndex);
  const zoomIn = useMultiToolStore((state) => state.zoomIn);
  const zoomOut = useMultiToolStore((state) => state.zoomOut);
  const scale = THUMB_ZOOM_LEVELS[zoomIndex];

  const primary = files[0];
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The route accepts at most `documents` inputs; stop adding there instead
  // of building a session that can never be submitted.
  const docsFull = files.length >= PDF_MULTI_TOOL_LIMITS.documents;

  // All documents belong to the upload store, including canvas additions.
  // Reconcile by File identity so additions/removals retain the surviving plan.
  useEffect(() => syncFiles(files), [files, syncFiles]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (processing || !over || active.id === over.id) return;
    movePage(String(active.id), String(over.id));
  };

  const primaryDoc = docs[0];

  // Doc 0's strip lives in the ALWAYS-rendered strips row below; it starts
  // the page-count render, and until the count lands (setPrimary has run)
  // the plan area shows a loader instead of the grid. The loading branch
  // must NOT early-return here: that would unmount the strips row, where
  // every document's render lifecycle lives: a classic deadlock.
  const primaryReady = Boolean(primaryDoc && primaryDoc.pageCount > 0);

  if (!primary) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
        {t.common.loading}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0" inert={processing}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-border">
        <p className="text-xs text-muted-foreground">{s.dragHint}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={docsFull}
            className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="multi-tool-add-doc"
          >
            <Plus className="h-3 w-3" />
            {s.addDocument}
          </button>
          <button
            type="button"
            onClick={resetPlan}
            disabled={!primaryDoc?.pageCount}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="multi-tool-reset"
          >
            <RotateCcw className="h-3 w-3" />
            {s.reset}
          </button>
          <div className="flex shrink-0 items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoomIndex === 0}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={s.zoomOut}
              data-testid="multi-tool-zoom-out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={zoomIn}
              disabled={zoomIndex === THUMB_ZOOM_LEVELS.length - 1}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted border-s border-border disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={s.zoomIn}
              data-testid="multi-tool-zoom-in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* The left file list is hidden for this editor (DOC_CANVAS_TOOLS),
              so start-over lives here: dropping the file-store selection and
              the session returns the page to its dropzone. */}
          <button
            type="button"
            onClick={() => {
              resetFiles();
              clear();
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            data-testid="multi-tool-new-file"
          >
            {t.toolPage.newFile}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            // Every picked PDF joins as its own document, in pick order.
            // accept=".pdf" is only a picker hint (force-selection bypasses
            // it), so filter here; a non-PDF would fail pdfjs and the server.
            const picked = Array.from(e.target.files ?? []).filter(
              (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
            );
            e.target.value = "";
            const room = PDF_MULTI_TOOL_LIMITS.documents - useFileStore.getState().files.length;
            if (room > 0 && picked.length > 0) addFiles(picked.slice(0, room));
          }}
        />
      </div>

      {/* Loaded documents as thumbnail strips with add buttons */}
      <div className="flex gap-2 px-4 py-2 border-b border-border overflow-x-auto">
        {docs.map((doc, i) => (
          <DocStrip key={doc.id} doc={doc} index={i} scale={scale} />
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={docsFull}
          className="shrink-0 rounded-lg border border-dashed border-border p-2 w-[164px] flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border"
        >
          <Plus className="h-4 w-4" />
          <span className="text-[10px]">{s.addDocument}</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {!primaryReady ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {primaryDoc?.failed ? (
              s.docFailed
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin me-2" />
                {t.common.loading}
              </>
            )}
          </div>
        ) : (
          <>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={plan.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="flex flex-wrap items-start gap-3">
                  {plan.map((entry, i) => (
                    <PlanCard
                      key={entry.id}
                      id={entry.id}
                      index={i}
                      page={entry.page}
                      rot={entry.rot}
                      thumb={docs[entry.doc]?.thumbs[entry.page]}
                      label={format(s.pageLabel, { n: i + 1 })}
                      scale={scale}
                      onRotate={(delta) => rotatePage(entry.id, delta)}
                      onRemove={() => removePage(entry.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {plan.length === 0 && (
              <div className="flex items-center justify-center text-sm text-muted-foreground py-12">
                {s.emptyPlan}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
