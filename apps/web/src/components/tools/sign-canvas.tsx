import { SafeError, type SignPlacement } from "@snapotter/shared";
import Konva from "konva";
import * as pdfjs from "pdfjs-dist";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { captureHandledError } from "@/lib/analytics";
import { pdfDocumentOptions } from "@/lib/pdfjs-options";
import { toNormalizedRect } from "@/lib/sign-geometry";
import type { SavedSignature } from "@/lib/signature-store";
import { safeRandomUUID } from "@/lib/uuid";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

// Largest on-screen scale; placements are normalized so it is cosmetic. A narrower
// area (a phone) gets a smaller one that fits the page to its width (#2190).
const RENDER_SCALE = 1.5;
const ROOT_PADDING = 32; // the root's p-4, both sides
// Cap on the page bitmap (device pixels), so a high-DPR screen can't ask for a
// canvas the browser refuses to allocate.
const MAX_CANVAS_PIXELS = 16_777_216;
const EXPORT_QUALITY = 2; // raster the baked PNG at ~2x page points for crispness
const KONVA_CONTAINER_ID = "sign-konva-container";

/** Rendered size (px) and page size (points) for one page, captured at render time. */
interface PageMeta {
  sizeW: number;
  sizeH: number;
  ptsW: number;
  ptsH: number;
}

/** A placed signature node, tagged with the page it belongs to. */
interface PlacedSig {
  id: string;
  page: number;
  node: Konva.Image;
}

export interface SignCanvasRef {
  addSignature: (sig: SavedSignature) => void;
  deleteSelected: () => void;
  exportPlacements: () => Promise<{ pngs: Blob[]; placements: SignPlacement[] }>;
  hasPlacements: () => boolean;
}

interface Props {
  fileUrl: string;
  onSelectionChange?: (hasSelection: boolean) => void;
  onCountChange?: (count: number) => void;
  onPlacementsChange?: () => void;
}

export const SignCanvas = forwardRef<SignCanvasRef, Props>(function SignCanvas(
  { fileUrl, onSelectionChange, onCountChange, onPlacementsChange },
  ref,
) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  // Each page's on-screen scale, decided the first time the page is drawn from the
  // area's width and then kept: a signature's pixel position was set against the
  // page as drawn, so revisiting a page has to draw it at the same scale. Pages of
  // different sizes (a landscape sheet in a portrait document) each fit the width.
  const scalesRef = useRef<Map<number, number>>(new Map());
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  // Flat list of every placed node across all pages. Nodes live here for the
  // component's lifetime; page navigation only attaches/detaches them from the
  // layer (never destroys), so revisiting a page keeps its signatures.
  const placementsRef = useRef<PlacedSig[]>([]);
  // Per-page render size (px) + page size (points), captured when each page renders.
  const pageMetaRef = useRef<Map<number, PageMeta>>(new Map());

  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Flips true once the document is loaded. Drives the render effect to run for
  // the first page, since setPage(0) is a no-op when page is already 0 (and
  // pageCount never changes for single-page PDFs).
  const [docReady, setDocReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Load the document once per file. A replaced file starts clean: drop the
  // previous document's placements and stage so they don't carry over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset + reload run only on file change; the parent callbacks are stable setters
  useEffect(() => {
    let cancelled = false;
    setDocReady(false);
    setLoadFailed(false);
    docRef.current = null;
    scalesRef.current.clear();
    for (const placed of placementsRef.current) placed.node.destroy();
    placementsRef.current = [];
    pageMetaRef.current.clear();
    stageRef.current?.destroy();
    stageRef.current = null;
    layerRef.current = null;
    trRef.current = null;
    onCountChange?.(0);
    onSelectionChange?.(false);
    const loadingTask = pdfjs.getDocument({ url: fileUrl, ...pdfDocumentOptions() });
    (async () => {
      const doc = await loadingTask.promise;
      if (cancelled) return;
      docRef.current = doc;
      setPageCount(doc.numPages);
      setPage(0);
      setDocReady(true);
    })().catch(() => {
      // loadingTask.destroy() in the cleanup rejects the in-flight promise
      // (Sentry NODE-1N); `cancelled` is already true then, so stay silent. A
      // genuine load failure (corrupt or password-protected file) must surface
      // instead of leaving a blank canvas that looks like it is still loading.
      if (!cancelled) setLoadFailed(true);
    });
    return () => {
      cancelled = true;
      loadingTask.destroy?.();
      docRef.current?.loadingTask.destroy();
      docRef.current = null;
    };
  }, [fileUrl]);

  // Render the current page and show that page's nodes. The Konva stage is
  // created once (lazily) and reused; switching pages resizes it and swaps which
  // signature nodes are attached.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onCountChange is a stable parent setter
  useEffect(() => {
    if (!docReady) return;
    const doc = docRef.current;
    const canvas = pdfCanvasRef.current;
    if (!doc || !canvas) return;
    let cancelled = false;
    let renderTask: pdfjs.RenderTask | undefined;
    (async () => {
      const pdfPage = await doc.getPage(page + 1);
      if (cancelled || docRef.current !== doc) return;
      const ptsViewport = pdfPage.getViewport({ scale: 1 });
      let scale = scalesRef.current.get(page);
      if (scale === undefined) {
        const available = (rootRef.current?.clientWidth ?? 0) - ROOT_PADDING;
        scale =
          available > 0 ? Math.min(RENDER_SCALE, available / ptsViewport.width) : RENDER_SCALE;
        scalesRef.current.set(page, scale);
      }
      const viewport = pdfPage.getViewport({ scale });
      // Everything else works in CSS pixels (the stage, the placement math); only
      // the bitmap gets the screen's pixel ratio, or text on a phone is a blur.
      const ratio = Math.max(
        1,
        Math.min(
          window.devicePixelRatio || 1,
          Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)),
        ),
      );
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setSize({ w: viewport.width, h: viewport.height });
      renderTask = pdfPage.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      await renderTask.promise;
      if (cancelled || docRef.current !== doc) return;

      pageMetaRef.current.set(page, {
        sizeW: viewport.width,
        sizeH: viewport.height,
        ptsW: ptsViewport.width,
        ptsH: ptsViewport.height,
      });

      let stage = stageRef.current;
      if (!stage) {
        stage = new Konva.Stage({
          container: KONVA_CONTAINER_ID,
          width: viewport.width,
          height: viewport.height,
        });
        const layer = new Konva.Layer();
        const tr = new Konva.Transformer({
          rotateEnabled: true,
          keepRatio: true,
          enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
          // Keep resize/rotate within the page bounds.
          boundBoxFunc: (oldBox, newBox) => {
            const s = stageRef.current;
            if (!s) return newBox;
            if (
              newBox.x < 0 ||
              newBox.y < 0 ||
              newBox.x + newBox.width > s.width() ||
              newBox.y + newBox.height > s.height()
            ) {
              return oldBox;
            }
            return newBox;
          },
        });
        layer.add(tr);
        stage.add(layer);
        stageRef.current = stage;
        layerRef.current = layer;
        trRef.current = tr;
        stage.on("click tap", (e) => {
          if (e.target === stage) {
            tr.nodes([]);
            onSelectionChange?.(false);
          }
        });
      } else {
        stage.width(viewport.width);
        stage.height(viewport.height);
      }

      const layer = layerRef.current;
      const tr = trRef.current;
      if (!layer || !tr) return;
      // Detach the previously shown signatures (keep the transformer), then
      // attach this page's. Nodes are never destroyed here.
      tr.nodes([]);
      for (const child of [...layer.getChildren()]) {
        if (child instanceof Konva.Image) child.remove();
      }
      for (const placed of placementsRef.current) {
        if (placed.page === page) layer.add(placed.node);
      }
      layer.batchDraw();
      onSelectionChange?.(false);
    })().catch((cause: unknown) => {
      // getPage()/render() reject when the loadingTask or renderTask is
      // cancelled mid-render (page navigation, file swap, or unmount);
      // `cancelled` is already true then (or `docRef` moved on), so stay
      // silent. A genuine render failure must tear down the stage, surface the
      // error state, and report it instead of leaving a blank page (#2249).
      if (cancelled || docRef.current !== doc) return;
      for (const placed of placementsRef.current) placed.node.destroy();
      placementsRef.current = [];
      pageMetaRef.current.clear();
      stageRef.current?.destroy();
      stageRef.current = null;
      layerRef.current = null;
      trRef.current = null;
      onCountChange?.(0);
      onSelectionChange?.(false);
      setLoadFailed(true);
      void captureHandledError(
        new SafeError("Sign PDF page failed to render", { kind: "operational", cause }),
        { error_class: "operational", tool_id: "sign-pdf" },
      );
    });
    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [page, docReady, onSelectionChange]);

  // Destroy the stage and all nodes on unmount.
  useEffect(() => {
    return () => {
      for (const placed of placementsRef.current) placed.node.destroy();
      placementsRef.current = [];
      stageRef.current?.destroy();
      stageRef.current = null;
    };
  }, []);

  const onPlacementsChangeRef = useRef(onPlacementsChange);
  onPlacementsChangeRef.current = onPlacementsChange;
  const emitCount = () => onCountChange?.(placementsRef.current.length);
  const emitPlacementsChange = () => onPlacementsChangeRef.current?.();

  // biome-ignore lint/correctness/useExhaustiveDependencies: the handle reads page/size snapshots; parent callbacks are stable and deliberately excluded to avoid rebuilding the handle every render
  useImperativeHandle(
    ref,
    () => ({
      addSignature(sig) {
        const layer = layerRef.current;
        const tr = trRef.current;
        if (!layer || !tr) return;
        const img = new window.Image();
        img.onload = () => {
          const targetW = size.w * 0.28;
          const scale = targetW / img.width;
          const node = new Konva.Image({
            image: img,
            x: size.w * 0.36,
            y: size.h * 0.45,
            width: img.width * scale,
            height: img.height * scale,
            draggable: true,
          });
          // Keep the dragged signature's bounding box within the page.
          node.dragBoundFunc((pos) => {
            const s = stageRef.current;
            if (!s) return pos;
            const box = node.getClientRect({ relativeTo: s });
            const dx = box.x - node.x();
            const dy = box.y - node.y();
            let x = pos.x;
            let y = pos.y;
            if (x + dx < 0) x = -dx;
            if (y + dy < 0) y = -dy;
            if (x + dx + box.width > s.width()) x = s.width() - box.width - dx;
            if (y + dy + box.height > s.height()) y = s.height() - box.height - dy;
            return { x, y };
          });
          node.on("click tap", () => {
            tr.nodes([node]);
            onSelectionChange?.(true);
          });
          node.on("dragend", emitPlacementsChange);
          node.on("transformend", emitPlacementsChange);
          layer.add(node);
          tr.nodes([node]);
          layer.batchDraw();
          placementsRef.current.push({ id: safeRandomUUID(), page, node });
          onSelectionChange?.(true);
          emitCount();
          emitPlacementsChange();
        };
        img.src = sig.dataUrl;
      },
      deleteSelected() {
        const tr = trRef.current;
        const layer = layerRef.current;
        if (!tr || !layer) return;
        const selected = tr.nodes();
        if (selected.length === 0) return;
        for (const n of selected) {
          placementsRef.current = placementsRef.current.filter((p) => p.node !== n);
          n.destroy();
        }
        tr.nodes([]);
        layer.batchDraw();
        onSelectionChange?.(false);
        emitCount();
        emitPlacementsChange();
      },
      hasPlacements() {
        return placementsRef.current.length > 0;
      },
      async exportPlacements() {
        const layer = layerRef.current;
        if (!layer) {
          throw new Error("Sign PDF canvas is not ready to export placements");
        }
        const dataUrls: string[] = [];
        const placements: SignPlacement[] = [];
        const tr = trRef.current;
        const selected = tr?.nodes() ?? [];
        tr?.nodes([]);
        // Detach all visible signatures; we re-attach each node one at a time so
        // getClientRect/toDataURL run on an attached node regardless of page.
        for (const child of [...layer.getChildren()]) {
          if (child instanceof Konva.Image) child.remove();
        }
        try {
          let sigIndex = 0;
          for (const placed of placementsRef.current) {
            const meta = pageMetaRef.current.get(placed.page);
            if (!meta) {
              throw new Error(`Missing page metadata for page ${placed.page + 1}`);
            }
            layer.add(placed.node);
            const box = placed.node.getClientRect({ relativeTo: layer });
            const norm = toNormalizedRect(
              { x: box.x, y: box.y, w: box.width, h: box.height },
              meta.sizeW,
              meta.sizeH,
            );
            placements.push({
              sig: sigIndex,
              page: placed.page,
              x: norm.x,
              y: norm.y,
              w: norm.w,
              h: norm.h,
            });
            const ratio = (EXPORT_QUALITY * meta.ptsW) / meta.sizeW;
            dataUrls.push(placed.node.toDataURL({ pixelRatio: ratio }));
            placed.node.remove();
            sigIndex++;
          }
        } finally {
          // Restore the current page's view synchronously before awaiting blob
          // conversion so mid-run canvas edits see an intact layer and selection.
          for (const child of [...layer.getChildren()]) {
            if (child instanceof Konva.Image) child.remove();
          }
          for (const placed of placementsRef.current) {
            if (placed.page === page) layer.add(placed.node);
          }
          if (selected.length) tr?.nodes(selected);
          layer.batchDraw();
        }
        const pngs: Blob[] = [];
        for (const dataUrl of dataUrls) {
          pngs.push(await (await fetch(dataUrl)).blob());
        }
        return { pngs, placements };
      },
    }),
    [page, size],
  );

  if (loadFailed) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="max-w-md text-center text-sm text-destructive">
          {t.toolSettings["sign-pdf"].loadFailed}
        </p>
      </div>
    );
  }

  return (
    // Bounded by the preview area and scrolling inside it, so a page taller or
    // wider than the area no longer spills over the settings controls. The children
    // centre with auto margins, which (unlike items-center) never push the start of
    // an overflowing page out of reach.
    <div
      ref={rootRef}
      className="flex min-h-0 min-w-0 max-h-full flex-1 flex-col gap-3 overflow-auto p-4"
    >
      <div className="relative mx-auto shrink-0" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={pdfCanvasRef}
          data-testid="sign-pdf-canvas"
          className="rounded border border-border shadow"
        />
        <div id={KONVA_CONTAINER_ID} className="absolute inset-0" />
      </div>
      <div className="mx-auto flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          ‹ {t.tools.documentView.previousPage}
        </button>
        <span className="font-medium text-foreground">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          {t.tools.documentView.nextPage} ›
        </button>
      </div>
    </div>
  );
});
