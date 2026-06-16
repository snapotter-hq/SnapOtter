import {
  AudioLines,
  CheckCircle2,
  File as FileIcon,
  FileText,
  Film,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useRef } from "react";
import type { FileEntry, PreviewKind } from "@/stores/file-store";

const BROWSER_IMG_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif"]);

/**
 * A renderable <img> source for the thumbnail, or null when the entry has no
 * image to show (e.g. audio/video/document originals). Processed previews and
 * processed image outputs are always real images, so they win when present.
 */
function thumbnailImageSrc(entry: FileEntry): string | null {
  if (entry.processedPreviewUrl) return entry.processedPreviewUrl;
  if (entry.processedUrl) {
    if (entry.processedUrl.startsWith("blob:")) return entry.processedUrl;
    const ext = decodeURIComponent(entry.processedUrl).split(".").pop()?.toLowerCase() ?? "";
    if (BROWSER_IMG_EXTS.has(ext)) return entry.processedUrl;
  }
  // The original blob only renders as an image for image-modality files;
  // pointing an <img> at an audio/video/pdf blob just shows a broken icon.
  if (entry.previewKind === "image") return entry.blobUrl;
  return null;
}

const PLACEHOLDER_ICON: Record<Exclude<PreviewKind, "image">, typeof FileIcon> = {
  audio: AudioLines,
  video: Film,
  document: FileText,
  none: FileIcon,
};

/** Icon + format label shown when a file has no image thumbnail. */
function ThumbnailPlaceholder({ entry }: { entry: FileEntry }) {
  const kind = entry.previewKind === "image" ? "none" : entry.previewKind;
  const Icon = PLACEHOLDER_ICON[kind];
  const ext = (entry.file.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 bg-muted">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {ext && (
        <span className="text-[8px] font-semibold leading-none text-muted-foreground">{ext}</span>
      )}
    </div>
  );
}

interface ThumbnailStripProps {
  entries: FileEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function ThumbnailStrip({ entries, selectedIndex, onSelect }: ThumbnailStripProps) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, []);

  if (entries.length <= 1) return null;

  return (
    <div
      className="flex gap-1.5 px-3 py-2 overflow-x-auto border-t border-border bg-muted/30"
      style={{ scrollBehavior: "smooth" }}
    >
      {entries.map((entry, i) => {
        const isSelected = i === selectedIndex;
        const isCompleted = entry.status === "completed";
        const isFailed = entry.status === "failed";
        const imgSrc = thumbnailImageSrc(entry);
        return (
          <button
            key={entry.file.name}
            type="button"
            ref={isSelected ? selectedRef : undefined}
            onClick={() => onSelect(i)}
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
            ) : imgSrc ? (
              <img
                src={imgSrc}
                alt={entry.file.name}
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <ThumbnailPlaceholder entry={entry} />
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
      })}
    </div>
  );
}
