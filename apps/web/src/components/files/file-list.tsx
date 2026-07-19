import { Download, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { getFileDownloadUrl } from "@/lib/api";
import { format } from "@/lib/format";
import { useFilesPageStore } from "@/stores/files-page-store";
import { FileListItem } from "./file-list-item";

export function FileList({ filterMimePrefix }: { filterMimePrefix?: string }) {
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
  const listRef = useRef<HTMLDivElement>(null);

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

  const handleListKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (files.length === 0) return;
      const currentIndex = selectedFileId ? files.findIndex((f) => f.id === selectedFileId) : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = currentIndex < files.length - 1 ? currentIndex + 1 : 0;
        selectFile(files[next].id);
        listRef.current
          ?.querySelector(`[data-file-id="${files[next].id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIndex > 0 ? currentIndex - 1 : files.length - 1;
        selectFile(files[prev].id);
        listRef.current
          ?.querySelector(`[data-file-id="${files[prev].id}"]`)
          ?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Home") {
        e.preventDefault();
        selectFile(files[0].id);
      } else if (e.key === "End") {
        e.preventDefault();
        selectFile(files[files.length - 1].id);
      }
    },
    [files, selectedFileId, selectFile],
  );

  const allChecked = files.length > 0 && checkedIds.size === files.length;
  const someChecked = checkedIds.size > 0;

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
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        className="flex-1 overflow-y-auto p-2 space-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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
        {!loading &&
          !error &&
          files.map((file) => (
            <FileListItem
              key={file.id}
              file={file}
              disabled={!!filterMimePrefix && !file.mimeType.startsWith(filterMimePrefix)}
            />
          ))}
      </div>
    </div>
  );
}
