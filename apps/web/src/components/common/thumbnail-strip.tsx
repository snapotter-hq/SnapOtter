import { useRef, useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { FileEntry } from "@/stores/file-store";

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
  }, [selectedIndex]);

  if (entries.length <= 1) return null;

  return (
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto border-t border-border bg-muted/30" style={{ scrollBehavior: "smooth" }}>
      {entries.map((entry, i) => {
        const isSelected = i === selectedIndex;
        const isCompleted = entry.status === "completed";
        const isFailed = entry.status === "failed";
        return (
          <button
            key={`${entry.file.name}-${i}`}
            ref={isSelected ? selectedRef : undefined}
            onClick={() => onSelect(i)}
            className={`relative shrink-0 rounded overflow-hidden transition-all ${
              isSelected ? "outline outline-2 outline-primary outline-offset-1" : "hover:outline hover:outline-1 hover:outline-border"
            }`}
            style={{ width: 52, height: 38 }}
            title={entry.file.name}
          >
            <img src={entry.processedUrl ?? entry.blobUrl} alt={entry.file.name} className="w-full h-full object-cover" draggable={false} />
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
