import { TOOLS } from "@stirling-image/shared";
import { cn } from "@/lib/utils";
import type { UserFile } from "@/lib/api";
import { useFilesPageStore } from "@/stores/files-page-store";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toolName(toolId: string): string {
  return TOOLS.find((t) => t.id === toolId)?.name ?? toolId;
}

interface FileListItemProps {
  file: UserFile;
}

export function FileListItem({ file }: FileListItemProps) {
  const { selectedFileId, checkedIds, selectFile, toggleChecked } = useFilesPageStore();
  const isSelected = selectedFileId === file.id;
  const isChecked = checkedIds.has(file.id);

  return (
    <div
      onClick={() => selectFile(file.id)}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        isSelected
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted border border-transparent",
      )}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={() => toggleChecked(file.id)}
        onClick={(e) => e.stopPropagation()}
        className="h-4 w-4 shrink-0 accent-primary"
      />

      {/* File name */}
      <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
        {file.originalName}
      </span>

      {/* Tool chain */}
      {file.toolChain.length > 0 && (
        <span className="hidden md:block text-xs text-primary shrink-0">
          {file.toolChain.map(toolName).join(" → ")}
        </span>
      )}

      {/* Version badge */}
      <span
        className={cn(
          "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
          file.version >= 2
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        V{file.version}
      </span>

      {/* Size */}
      <span className="hidden sm:block text-xs text-muted-foreground shrink-0 w-16 text-right">
        {formatSize(file.size)}
      </span>

      {/* Date */}
      <span className="hidden lg:block text-xs text-muted-foreground shrink-0 w-24 text-right">
        {formatDate(file.createdAt)}
      </span>
    </div>
  );
}
