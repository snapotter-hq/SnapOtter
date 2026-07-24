import { Download, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { getFileDownloadUrl } from "@/lib/api";
import { format } from "@/lib/format";
import { useFilesPageStore } from "@/stores/files-page-store";
import { FileListItem, type FileNavigationKey } from "./file-list-item";

interface FileListProps {
  filterMimePrefix?: string;
  onFileActivate?: (fileId: string) => void;
}

export function FileList({ filterMimePrefix, onFileActivate }: FileListProps) {
  const { t } = useTranslation();
  const {
    files: allFiles,
    checkedIds,
    selectedFileId,
    selectFile,
    loading,
    error,
    fetchFiles,
    deleteChecked,
    toggleCheckAll,
    setSearchQuery,
  } = useFilesPageStore();

  const [inputValue, setInputValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const files = allFiles;

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(val);
      fetchFiles();
    }, 300);
  }

  function handleBulkDownload() {
    for (const id of checkedIds) {
      const a = document.createElement("a");
      a.href = getFileDownloadUrl(id);
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  const enabledFileIndices = files.flatMap((file, index) =>
    filterMimePrefix && !file.mimeType.startsWith(filterMimePrefix) ? [] : [index],
  );
  const selectedFileIndex = selectedFileId
    ? files.findIndex((file) => file.id === selectedFileId)
    : -1;
  const tabStopIndex = enabledFileIndices.includes(selectedFileIndex)
    ? selectedFileIndex
    : (enabledFileIndices[0] ?? -1);

  const handleFileNavigate = useCallback(
    (currentIndex: number, key: FileNavigationKey) => {
      const enabledIndices = files.flatMap((file, index) =>
        filterMimePrefix && !file.mimeType.startsWith(filterMimePrefix) ? [] : [index],
      );
      if (enabledIndices.length === 0) return;

      const currentEnabledIndex = enabledIndices.indexOf(currentIndex);
      let targetIndex: number;
      if (key === "Home") targetIndex = enabledIndices[0];
      else if (key === "End") targetIndex = enabledIndices[enabledIndices.length - 1];
      else if (key === "ArrowDown") {
        targetIndex = enabledIndices[(currentEnabledIndex + 1) % enabledIndices.length];
      } else {
        const previousIndex =
          currentEnabledIndex <= 0 ? enabledIndices.length - 1 : currentEnabledIndex - 1;
        targetIndex = enabledIndices[previousIndex];
      }

      selectFile(files[targetIndex].id);
      const target = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-file-button-index="${targetIndex}"]`,
      );
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
    },
    [files, filterMimePrefix, selectFile],
  );

  const allChecked = files.length > 0 && checkedIds.size === files.length;
  const someChecked = checkedIds.size > 0;
  const hasFileItems = !loading && !error && files.length > 0;
  const listClassName =
    "flex-1 overflow-y-auto p-2 space-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t.files.searchPlaceholder}
            value={inputValue}
            onChange={handleSearchChange}
            className="w-full ps-8 pe-3 py-1.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <input
          type="checkbox"
          aria-label={`${t.files.selectFile}: ${t.files.myFiles}`}
          checked={allChecked}
          onChange={toggleCheckAll}
          className="h-4 w-4 accent-primary"
        />
        <span className="text-xs text-muted-foreground flex-1">
          {someChecked
            ? format(t.files.selectedCount, { count: checkedIds.size })
            : format(t.files.fileCount, { count: files.length })}
        </span>
        {someChecked && (
          <>
            <button
              type="button"
              onClick={deleteChecked}
              className="flex items-center gap-1 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t.files.delete}
            </button>
            <button
              type="button"
              onClick={handleBulkDownload}
              className="flex items-center gap-1 px-2 py-1 text-xs text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              {t.files.download}
            </button>
          </>
        )}
      </div>

      {/* File list */}
      {hasFileItems ? (
        <ul ref={listRef} className={`${listClassName} m-0 list-none`}>
          {files.map((file, index) => (
            <FileListItem
              key={file.id}
              file={file}
              index={index}
              disabled={!!filterMimePrefix && !file.mimeType.startsWith(filterMimePrefix)}
              tabStop={index === tabStopIndex}
              onActivate={onFileActivate}
              onNavigate={handleFileNavigate}
            />
          ))}
        </ul>
      ) : (
        <div className={listClassName}>
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {!loading && !error && files.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">{t.files.noFilesFound}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
