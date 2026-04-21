import { Check, FolderOpen, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiListFiles,
  formatHeaders,
  getFileDownloadUrl,
  getFileThumbnailUrl,
  type UserFile,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface FileLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (files: File[]) => void;
}

export function FileLibraryModal({ open, onClose, onImport }: FileLibraryModalProps) {
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFiles = useCallback(async (search?: string) => {
    setLoading(true);
    try {
      const result = await apiListFiles({ search: search || undefined, limit: 200 });
      setFiles(result.files);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchFiles();
      setCheckedIds(new Set());
      setSearchQuery("");
    }
  }, [open, fetchFiles]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchFiles(val), 300);
  }

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === files.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(files.map((f) => f.id)));
    }
  }

  async function handleImport() {
    if (checkedIds.size === 0) return;
    setImporting(true);
    try {
      const toDownload = files.filter((f) => checkedIds.has(f.id));
      const downloaded = await Promise.all(
        toDownload.map(async (f) => {
          const res = await fetch(getFileDownloadUrl(f.id), { headers: formatHeaders() });
          if (!res.ok) return null;
          const blob = await res.blob();
          return new File([blob], f.originalName, { type: f.mimeType });
        }),
      );
      const valid = downloaded.filter((f): f is File => f !== null);
      if (valid.length > 0) {
        onImport(valid);
        onClose();
      }
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  const allChecked = files.length > 0 && checkedIds.size === files.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg max-h-[80vh] bg-background border border-border rounded-xl shadow-xl flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <FolderOpen className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground flex-1">Import from Library</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Select all toolbar */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border shrink-0">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-xs text-muted-foreground flex-1">
            {checkedIds.size > 0 ? `${checkedIds.size} selected` : `${files.length} files`}
          </span>
        </div>

        {/* File grid */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && files.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">No files found</p>
            </div>
          )}
          {!loading && files.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.map((file) => {
                const checked = checkedIds.has(file.id);
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => toggleCheck(file.id)}
                    className={cn(
                      "relative group rounded-lg border overflow-hidden aspect-square flex items-center justify-center bg-muted/30 transition-all",
                      checked
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <img
                      src={getFileThumbnailUrl(file.id)}
                      alt={file.originalName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {checked && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                      <p className="text-[10px] text-white truncate">{file.originalName}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={checkedIds.size === 0 || importing}
            className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>Import{checkedIds.size > 0 ? ` (${checkedIds.size})` : ""}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
