import type { SignPlacement } from "@snapotter/doc-engine";
import Konva from "konva";
import * as pdfjs from "pdfjs-dist";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toNormalizedRect } from "@/lib/sign-geometry";
import type { SavedSignature } from "@/lib/signature-store";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const RENDER_SCALE = 1.5; // on-screen scale; placements are normalized so this is cosmetic
const EXPORT_QUALITY = 2; // raster the baked PNG at ~2x page points for crispness
const KONVA_CONTAINER_ID = "sign-konva-container";

interface PlacedSig {
  id: string;
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
}

export const SignCanvas = forwardRef<SignCanvasRef, Props>(function SignCanvas(
  { fileUrl, onSelectionChange, onCountChange },
  ref,
) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const layerRef = useRef<Konva.Layer | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const placementsRef = useRef<Map<number, PlacedSig[]>>(new Map()); // page -> nodes

  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pagePts, setPagePts] = useState({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = await pdfjs.getDocument({ url: fileUrl }).promise;
      if (cancelled) return;
      docRef.current = doc;
      setPageCount(doc.numPages);
      setPage(0);
    })();
    return () => {
      cancelled = true;
      docRef.current?.loadingTask.destroy();
    };
  }, [fileUrl]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = docRef.current;
      const canvas = pdfCanvasRef.current;
      if (!doc || !canvas) return;
      const pdfPage = await doc.getPage(page + 1);
      if (cancelled) return;
      const ptsViewport = pdfPage.getViewport({ scale: 1 });
      setPagePts({ w: ptsViewport.width, h: ptsViewport.height });
      const viewport = pdfPage.getViewport({ scale: RENDER_SCALE });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setSize({ w: viewport.width, h: viewport.height });
      await pdfPage.render({ canvas, viewport }).promise;

      stageRef.current?.destroy();
      const stage = new Konva.Stage({
        container: KONVA_CONTAINER_ID,
        width: viewport.width,
        height: viewport.height,
      });
      const layer = new Konva.Layer();
      const tr = new Konva.Transformer({
        rotateEnabled: true,
        keepRatio: true,
        enabledAnchors: ["top-left", "top-right", "bottom-left", "bottom-right"],
      });
      layer.add(tr);
      stage.add(layer);
      stageRef.current = stage;
      layerRef.current = layer;
      trRef.current = tr;

      for (const placed of placementsRef.current.get(page) ?? []) layer.add(placed.node);
      layer.draw();

      stage.on("click tap", (e) => {
        if (e.target === stage) {
          tr.nodes([]);
          onSelectionChange?.(false);
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [page, onSelectionChange]);

  const emitCount = () => {
    let n = 0;
    for (const list of placementsRef.current.values()) n += list.length;
    onCountChange?.(n);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: handle reads page/size/pagePts snapshots; the parent callbacks are stable and deliberately excluded to avoid rebuilding the handle every render
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
          node.on("click tap", () => {
            tr.nodes([node]);
            onSelectionChange?.(true);
          });
          layer.add(node);
          tr.nodes([node]);
          layer.draw();
          const list = placementsRef.current.get(page) ?? [];
          list.push({ id: crypto.randomUUID(), node });
          placementsRef.current.set(page, list);
          onSelectionChange?.(true);
          emitCount();
        };
        img.src = sig.dataUrl;
      },
      deleteSelected() {
        const tr = trRef.current;
        const layer = layerRef.current;
        if (!tr || !layer) return;
        for (const n of tr.nodes()) {
          n.destroy();
          for (const [pg, list] of placementsRef.current) {
            placementsRef.current.set(
              pg,
              list.filter((p) => p.node !== n),
            );
          }
        }
        tr.nodes([]);
        layer.draw();
        onSelectionChange?.(false);
        emitCount();
      },
      hasPlacements() {
        for (const list of placementsRef.current.values()) if (list.length) return true;
        return false;
      },
      async exportPlacements() {
        const pngs: Blob[] = [];
        const placements: SignPlacement[] = [];
        const stage = stageRef.current;
        const selected = trRef.current?.nodes() ?? [];
        trRef.current?.nodes([]); // hide handles while rasterizing
        trRef.current?.getLayer()?.draw();
        let sigIndex = 0;
        for (const [pg, list] of placementsRef.current) {
          for (const placed of list) {
            const node = placed.node;
            const box = node.getClientRect({ relativeTo: stage ?? undefined });
            const norm = toNormalizedRect(
              { x: box.x, y: box.y, w: box.width, h: box.height },
              size.w,
              size.h,
            );
            placements.push({
              sig: sigIndex,
              page: pg,
              x: norm.x,
              y: norm.y,
              w: norm.w,
              h: norm.h,
            });
            const ratio = (EXPORT_QUALITY * pagePts.w) / size.w;
            const dataUrl = node.toDataURL({ pixelRatio: ratio });
            pngs.push(await (await fetch(dataUrl)).blob());
            sigIndex++;
          }
        }
        if (selected.length) trRef.current?.nodes(selected);
        return { pngs, placements };
      },
    }),
    [page, size, pagePts],
  );

  return (
    <div className="flex flex-1 flex-col items-center gap-3 p-4">
      <div className="relative" style={{ width: size.w, height: size.h }}>
        <canvas
          ref={pdfCanvasRef}
          data-testid="sign-pdf-canvas"
          className="rounded border border-border shadow"
        />
        <div id={KONVA_CONTAINER_ID} className="absolute inset-0" />
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          ‹ Prev
        </button>
        <span className="font-medium text-foreground">
          Page {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-border px-2 py-1 disabled:opacity-40"
        >
          Next ›
        </button>
      </div>
    </div>
  );
});
