import { Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { cn } from "@/lib/utils";
import { useFilesPageStore } from "@/stores/files-page-store";

export function FileUploadArea() {
  const { t } = useTranslation();
  const { uploadFiles, loading, uploadProgress } = useFilesPageStore();
  const [dragging, setDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) uploadFiles(files);
    e.target.value = "";
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "w-full max-w-lg flex flex-col items-center justify-center gap-4 p-12 rounded-xl border-2 border-dashed transition-colors cursor-pointer",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/50",
          loading && "pointer-events-none opacity-50",
        )}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            {uploadProgress !== null && uploadProgress > 0 && (
              <span className="text-xs font-medium text-primary-ink">{uploadProgress}%</span>
            )}
          </div>
        ) : (
          <Upload className="h-10 w-10 text-muted-foreground" />
        )}
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {loading ? t.common.loading : t.files.dropFilesHere}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {loading ? "" : t.files.orClickToSelect}
          </p>
        </div>
        <input type="file" multiple className="hidden" onChange={handleInputChange} />
      </label>
    </div>
  );
}
