import { AlertCircle, FileImage, FileUp, Upload } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useUrlImport } from "@/hooks/use-url-import";
import { cn } from "@/lib/utils";
import { UrlImportModal } from "./url-import-modal";

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "bmp",
  "avif",
  "tiff",
  "tif",
  "ico",
  "heic",
  "heif",
  "hif",
  "jxl",
  "apng",
  "dng",
  "cr2",
  "cr3",
  "nef",
  "nrw",
  "arw",
  "orf",
  "rw2",
  "raf",
  "pef",
  "3fr",
  "iiq",
  "srw",
  "x3f",
  "rwl",
  "gpr",
  "fff",
  "mrw",
  "mef",
  "kdc",
  "dcr",
  "erf",
  "ptx",
  "tga",
  "psd",
  "exr",
  "hdr",
  "svgz",
  "jp2",
  "j2k",
  "j2c",
  "jpc",
  "jpf",
  "jpx",
  "qoi",
  "eps",
  "epsf",
  "dds",
  "cur",
  "dpx",
  "cin",
  "fits",
  "fit",
  "fts",
  "pbm",
  "pgm",
  "ppm",
  "pnm",
  "pam",
  "pfm",
]);

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

interface DropzoneProps {
  onFiles?: (files: File[]) => void;
  onUrlImport?: (file: File) => void;
  accept?: string;
  multiple?: boolean;
  /** Files that have already been dropped (for showing count & list). */
  currentFiles?: File[];
  /** Use a smaller layout that fits constrained containers like the pipeline preview. */
  compact?: boolean;
  /** Override the default isImageFile check for drag/drop and paste. */
  fileFilter?: (file: File) => boolean;
  /** Override the format hint text (e.g. "SVG files only"). */
  acceptDescription?: string;
}

// Browsers may not map certain formats (HEIC, JXL, RAW, etc.) to image/* in file pickers.
// Append explicit extensions so they are selectable.
function expandAccept(accept?: string): string | undefined {
  if (!accept?.includes("image/*")) return accept;
  return `${accept},.avif,.heic,.heif,.hif,.jxl,.ico,.dng,.cr2,.cr3,.nef,.nrw,.arw,.orf,.rw2,.raf,.pef,.3fr,.iiq,.srw,.x3f,.rwl,.gpr,.fff,.mrw,.mef,.kdc,.dcr,.erf,.ptx,.tga,.psd,.exr,.hdr,.svgz,.jp2,.j2k,.j2c,.jpc,.jpf,.jpx,.qoi,.eps,.epsf,.dds,.cur,.apng,.dpx,.cin,.fits,.fit,.fts,.ppm,.pgm,.pbm,.pnm,.pam,.pfm`;
}

export function Dropzone({
  onFiles,
  onUrlImport,
  accept,
  multiple = true,
  currentFiles = [],
  compact = false,
  fileFilter,
  acceptDescription,
}: DropzoneProps) {
  const { t } = useTranslation();
  // When no explicit filter is given, accept any file: the file picker still
  // restricts via `accept`, and the server validates per modality. Image tools
  // pass an explicit fileFilter, so they are unaffected.
  const checkFile = fileFilter ?? (() => true);
  const resolvedAccept = expandAccept(accept);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const { importSingleUrl } = useUrlImport();

  const handleUrlSubmit = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlLoading(true);
    setUrlError(null);
    const file = await importSingleUrl(url);
    if (file) {
      if (!checkFile(file)) {
        setUrlError(acceptDescription ?? t.dropzone.unsupportedFileType);
      } else {
        setUrlInput("");
        onUrlImport?.(file);
      }
    } else {
      setUrlError(t.dropzone.urlFetchFailed);
    }
    setUrlLoading(false);
  }, [urlInput, importSingleUrl, onUrlImport, checkFile, acceptDescription, t]);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
    else if (e.type === "dragleave") setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setError(null);
      const droppedFiles = Array.from(e.dataTransfer.files);
      const validFiles = droppedFiles.filter(checkFile);
      if (validFiles.length > 0) {
        onFiles?.(validFiles);
      } else if (droppedFiles.length > 0) {
        setError(acceptDescription || `This tool accepts ${accept || "the supported file types"}`);
      }
    },
    [onFiles, checkFile, acceptDescription, accept],
  );

  const handleClick = useCallback(() => {
    setError(null);
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (resolvedAccept) input.accept = resolvedAccept;
    input.onchange = (e) => {
      const picked = Array.from((e.target as HTMLInputElement).files || []);
      const validFiles = picked.filter(checkFile);
      if (validFiles.length > 0) {
        onFiles?.(validFiles);
      } else if (picked.length > 0) {
        setError(acceptDescription || `This tool accepts ${accept || "the supported file types"}`);
      }
    };
    input.click();
  }, [multiple, resolvedAccept, checkFile, onFiles, acceptDescription, accept]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const clip = e.clipboardData;
      if (!clip) return;

      const files: File[] = [];

      if (clip.files.length > 0) {
        for (const file of clip.files) {
          if (checkFile(file)) files.push(file);
        }
      } else if (clip.items) {
        for (const item of clip.items) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file && checkFile(file)) files.push(file);
          }
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        onFiles?.(files);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [onFiles, checkFile]);

  const hasMultipleFiles = currentFiles.length > 1;

  return (
    <section
      aria-label={t.a11y.fileDropZone}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 mx-auto max-w-2xl w-full",
        compact ? "min-h-0 h-full" : "min-h-[400px]",
        isDragging
          ? "border-primary bg-primary/10 scale-[1.01]"
          : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <div className={cn("flex flex-col items-center", compact ? "gap-2 p-4" : "gap-5 p-8")}>
        <div
          className={cn(
            "rounded-2xl bg-primary/8 p-4 transition-colors duration-200",
            isDragging ? "bg-primary/15" : "group-hover:bg-primary/12",
          )}
        >
          <FileUp
            className={cn(
              "transition-all duration-200",
              compact ? "h-8 w-8" : "h-10 w-10",
              isDragging ? "text-primary" : "text-primary/50 group-hover:text-primary/70",
            )}
            strokeWidth={1.5}
          />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className={cn("font-medium", compact ? "text-sm" : "text-base", "text-foreground/80")}>
            {t.dropzone.dropPrompt}
          </p>
          <p className="text-sm text-muted-foreground">{t.dropzone.browseOrPaste}</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-primary text-primary-foreground transition-all duration-200 text-sm font-medium shadow-sm",
            compact ? "px-5 py-2" : "px-8 py-3",
            "hover:bg-primary/90 hover:shadow-md active:scale-[0.98]",
          )}
        >
          <Upload className="h-4 w-4" />
          {t.common.upload}
        </button>
        <p className="text-xs text-muted-foreground">
          {acceptDescription ?? t.dropzone.defaultFormats}
        </p>

        {error && (
          <p className="mt-3 text-sm text-destructive flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {!compact && onUrlImport && (
          <>
            <div className="flex items-center gap-2 w-full max-w-xs">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">{t.dropzone.orSeparator}</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2 w-full max-w-sm">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setUrlError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleUrlSubmit();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder={t.dropzone.urlPlaceholder}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                disabled={urlLoading}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleUrlSubmit();
                }}
                disabled={urlLoading || !urlInput.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {urlLoading ? t.dropzone.urlLoadingIndicator : t.dropzone.addUrlButton}
              </button>
            </div>
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowBulkModal(true);
              }}
              className="text-xs text-primary hover:text-primary/80"
            >
              {t.dropzone.importMultipleUrls}
            </button>
          </>
        )}

        {hasMultipleFiles && (
          <div className="flex flex-col items-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <FileImage className="h-3.5 w-3.5" />
              {currentFiles.length} files selected
            </span>
            <div className="max-h-32 overflow-y-auto w-full max-w-xs">
              {currentFiles.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between text-xs text-muted-foreground px-2 py-0.5"
                >
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 ms-2">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showBulkModal && (
        <UrlImportModal
          onClose={() => setShowBulkModal(false)}
          onImport={(files) => {
            for (const file of files) {
              if (checkFile(file)) onUrlImport?.(file);
            }
            setShowBulkModal(false);
          }}
        />
      )}
    </section>
  );
}
