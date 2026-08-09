import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeftRight,
  CheckCircle2,
  File as FileIcon,
  FileText,
  Film,
  GripVertical,
  Loader2,
  Music,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import type { FileEntry, PreviewKind } from "@/stores/file-store";

const BROWSER_IMG_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif"]);
const THUMB_W = 104;
const THUMB_H = 76;

/** Image URL to show directly in an <img>, or null when the entry has no
 *  browser-renderable image (audio/video/PDF inputs get a generated thumb or
 *  a modality icon instead of a broken <img>). */
function imageThumbSrc(entry: FileEntry): string | null {
  if (entry.processedPreviewUrl) return entry.processedPreviewUrl;
  if (entry.processedUrl) {
    const ext =
      decodeURIComponent(entry.processedUrl).split("?")[0].split(".").pop()?.toLowerCase() ?? "";
    if (BROWSER_IMG_EXTS.has(ext)) return entry.processedUrl;
    if (entry.processedUrl.startsWith("blob:") && entry.previewKind === "image")
      return entry.processedUrl;
  }
  if (entry.previewKind === "image") return entry.blobUrl;
  return null;
}

/** Grab the first frame of a video into a small JPEG data URL. Returns a
 *  cancel fn; calls back with null on any decode/timeout failure. */
function captureVideoFrame(src: string, onDone: (url: string | null) => void): () => void {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  let settled = false;
  const timer = setTimeout(() => settle(null), 5000);
  function settle(url: string | null) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    video.removeEventListener("loadeddata", onLoaded);
    video.removeEventListener("seeked", onSeeked);
    video.removeEventListener("error", onErr);
    video.removeAttribute("src");
    video.load();
    onDone(url);
  }
  function onLoaded() {
    const d = video.duration;
    const t = Number.isFinite(d) && d > 0 ? Math.min(0.1, d / 2) : 0;
    try {
      video.currentTime = t;
    } catch {
      settle(null);
    }
  }
  function onSeeked() {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return settle(null);
    try {
      const scale = Math.min(THUMB_W / w, THUMB_H / h, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return settle(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      settle(canvas.toDataURL("image/jpeg", 0.7));
    } catch {
      settle(null);
    }
  }
  function onErr() {
    settle(null);
  }
  video.addEventListener("loadeddata", onLoaded);
  video.addEventListener("seeked", onSeeked);
  video.addEventListener("error", onErr);
  video.src = src;
  return () => settle(null);
}

/** Render page 1 of a PDF into a small JPEG data URL (pdf.js, lazy-imported). */
async function renderPdfThumb(file: File, onDone: (url: string | null) => void): Promise<void> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).href;
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(THUMB_W / base.width, THUMB_H / base.height, 2);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    onDone(canvas.toDataURL("image/jpeg", 0.8));
    loadingTask.destroy();
  } catch {
    onDone(null);
  }
}

/** Lazily produce a thumbnail data URL for video/PDF entries. */
function useGeneratedThumb(entry: FileEntry): string | null {
  const { previewKind, blobUrl, file } = entry;
  const isPdf = file.name.toLowerCase().endsWith(".pdf");
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setThumb(null);
    if (previewKind === "video") {
      const cancel = captureVideoFrame(blobUrl, (u) => {
        if (active) setThumb(u);
      });
      return () => {
        active = false;
        cancel();
      };
    }
    if (previewKind === "document" && isPdf) {
      renderPdfThumb(file, (u) => {
        if (active) setThumb(u);
      });
    }
    return () => {
      active = false;
    };
  }, [previewKind, blobUrl, isPdf, file]);
  return thumb;
}

function ModalityIcon({ kind }: { kind: PreviewKind }) {
  const cls = "h-4 w-4 text-muted-foreground";
  if (kind === "video") return <Film className={cls} />;
  if (kind === "audio") return <Music className={cls} />;
  if (kind === "document") return <FileText className={cls} />;
  return <FileIcon className={cls} />;
}

/** Per-tile content: a real image/thumbnail when available, else a modality
 *  icon + extension label (never a broken <img>). */
function Thumb({ entry }: { entry: FileEntry }) {
  const generated = useGeneratedThumb(entry);
  const [imgError, setImgError] = useState(false);
  const src = entry.previewKind === "image" ? imageThumbSrc(entry) : generated;
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={entry.file.name}
        className="w-full h-full object-cover"
        draggable={false}
        onError={() => setImgError(true)}
      />
    );
  }
  const ext = entry.file.name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "";
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 bg-muted">
      <ModalityIcon kind={entry.previewKind} />
      {ext && (
        <span className="text-[7px] leading-none font-medium text-muted-foreground">{ext}</span>
      )}
    </div>
  );
}

/** The selectable tile: thumbnail plus completed/failed status badge. */
function ThumbTile({
  entry,
  index,
  isSelected,
  buttonRef,
  onSelect,
}: {
  entry: FileEntry;
  index: number;
  isSelected: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  onSelect: (index: number) => void;
}) {
  const isCompleted = entry.status === "completed";
  const isFailed = entry.status === "failed";
  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={() => onSelect(index)}
      className={`relative shrink-0 rounded overflow-hidden transition-all ${
        isSelected
          ? "outline outline-2 outline-primary outline-offset-1"
          : "hover:outline hover:outline-1 hover:outline-border"
      }`}
      style={{ width: 52, height: 38 }}
      title={entry.file.name}
    >
      {entry.previewLoading ? (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <Thumb entry={entry} />
      )}
      {isCompleted && (
        <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
          <CheckCircle2 className="h-2.5 w-2.5 text-white" />
        </div>
      )}
      {isFailed && (
        <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center">
          <XCircle className="h-2.5 w-2.5 text-white" />
        </div>
      )}
    </button>
  );
}

/** A ThumbTile wrapped in a dnd-kit sortable, with a keyboard-reachable drag
 *  handle. Tapping the tile still selects; the handle is the drag activator. */
function SortableThumbTile({
  entry,
  index,
  isSelected,
  buttonRef,
  onSelect,
  dragLabel,
}: {
  entry: FileEntry;
  index: number;
  isSelected: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  onSelect: (index: number) => void;
  dragLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  // dnd-kit sets role="button" on the handle; the native <button> already has
  // that role, so drop it to avoid a redundant-role attribute.
  const { role: _dragRole, ...dragAttributes } = attributes;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative shrink-0 ${isDragging ? "z-10 opacity-50" : ""}`}
    >
      <ThumbTile
        entry={entry}
        index={index}
        isSelected={isSelected}
        buttonRef={buttonRef}
        onSelect={onSelect}
      />
      <button
        type="button"
        {...dragAttributes}
        {...listeners}
        aria-label={dragLabel}
        title={dragLabel}
        className="absolute top-0 start-0 flex h-4 w-4 items-center justify-center rounded-ee bg-background/70 text-muted-foreground cursor-grab active:cursor-grabbing hover:bg-background hover:text-foreground focus:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" />
      </button>
    </div>
  );
}

interface ThumbnailStripProps {
  entries: FileEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** When provided, tiles become drag-sortable; called with the moved indexes. */
  onReorder?: (from: number, to: number) => void;
  /** When provided, a reverse-order control is shown. */
  onReverse?: () => void;
}

export function ThumbnailStrip({
  entries,
  selectedIndex,
  onSelect,
  onReorder,
  onReverse,
}: ThumbnailStripProps) {
  const { t } = useTranslation();
  const selectedRef = useRef<HTMLButtonElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, []);

  if (entries.length <= 1) return null;

  function handleDragEnd(event: DragEndEvent) {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = entries.findIndex((e) => e.id === active.id);
    const to = entries.findIndex((e) => e.id === over.id);
    if (from !== -1 && to !== -1) onReorder(from, to);
  }

  const tiles = entries.map((entry, i) => {
    const isSelected = i === selectedIndex;
    const buttonRef = isSelected ? selectedRef : undefined;
    if (!onReorder) {
      return (
        <ThumbTile
          key={entry.id}
          entry={entry}
          index={i}
          isSelected={isSelected}
          buttonRef={buttonRef}
          onSelect={onSelect}
        />
      );
    }
    return (
      <SortableThumbTile
        key={entry.id}
        entry={entry}
        index={i}
        isSelected={isSelected}
        buttonRef={buttonRef}
        onSelect={onSelect}
        dragLabel={t.a11y.dragToReorder}
      />
    );
  });

  const scroller = (
    <div
      className="flex gap-1.5 px-3 py-2 overflow-x-auto grow"
      style={{ scrollBehavior: "smooth" }}
    >
      {onReorder ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={entries.map((e) => e.id)}
            strategy={horizontalListSortingStrategy}
          >
            {tiles}
          </SortableContext>
        </DndContext>
      ) : (
        tiles
      )}
    </div>
  );

  return (
    <div className="flex items-stretch border-t border-border bg-muted/30">
      {onReverse && (
        <button
          type="button"
          onClick={onReverse}
          title={t.a11y.reverseOrder}
          aria-label={t.a11y.reverseOrder}
          className="shrink-0 px-2 flex items-center border-e border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </button>
      )}
      {scroller}
    </div>
  );
}
