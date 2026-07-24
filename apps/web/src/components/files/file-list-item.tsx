import { TOOLS } from "@snapotter/shared";
import { useId } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import type { UserFile } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  index: number;
  disabled?: boolean;
  tabStop: boolean;
  onActivate?: (fileId: string) => void;
  onNavigate: (index: number, key: FileNavigationKey) => void;
}

export type FileNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function FileListItem({
  file,
  index,
  disabled,
  tabStop,
  onActivate,
  onNavigate,
}: FileListItemProps) {
  const { t } = useTranslation();
  const { selectedFileId, checkedIds, selectFile, toggleChecked } = useFilesPageStore();
  const isSelected = selectedFileId === file.id;
  const isChecked = checkedIds.has(file.id);
  const fileNameId = useId();
  const fileDescriptionId = useId();

  return (
    <li
      data-file-id={file.id}
      className={cn(
        "flex items-center rounded-lg transition-colors border",
        disabled
          ? "border-transparent"
          : isSelected
            ? "bg-primary/10 border-primary/30"
            : "hover:bg-muted border-transparent",
      )}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        aria-label={`${t.files.selectFile}: ${file.originalName}`}
        checked={isChecked}
        onChange={() => toggleChecked(file.id)}
        className="h-4 w-4 shrink-0 ms-3 accent-primary"
      />

      <button
        type="button"
        aria-labelledby={fileNameId}
        aria-describedby={fileDescriptionId}
        aria-current={isSelected ? "true" : undefined}
        data-file-button-index={index}
        disabled={disabled}
        tabIndex={tabStop ? 0 : -1}
        onClick={() => {
          selectFile(file.id);
          onActivate?.(file.id);
        }}
        onKeyDown={(event) => {
          if (
            !disabled &&
            (event.key === "ArrowDown" ||
              event.key === "ArrowUp" ||
              event.key === "Home" ||
              event.key === "End")
          ) {
            event.preventDefault();
            onNavigate(index, event.key);
          }
        }}
        className="flex flex-1 min-w-0 items-center gap-3 ps-3 pe-3 py-2 text-start rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {/* File name */}
        <span
          id={fileNameId}
          className="flex-1 min-w-0 text-sm font-medium text-foreground truncate"
        >
          {file.originalName}
        </span>
        <span id={fileDescriptionId} className="sr-only">
          {t.files.version} {file.version}, {t.files.size}: {formatSize(file.size)},{" "}
          {formatDate(file.createdAt)}
          {file.toolChain.length > 0
            ? `, ${t.files.toolsUsed}: ${file.toolChain.map(toolName).join(", ")}`
            : ""}
        </span>

        {/* Tool chain */}
        {file.toolChain.length > 0 && (
          <span className="hidden md:block text-xs text-primary-ink shrink-0">
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
        <span className="hidden sm:block text-xs text-muted-foreground shrink-0 w-16 text-end">
          {formatSize(file.size)}
        </span>

        {/* Date */}
        <span className="hidden lg:block text-xs text-muted-foreground shrink-0 w-24 text-end">
          {formatDate(file.createdAt)}
        </span>
      </button>
    </li>
  );
}
