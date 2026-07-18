import { Download, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";

const FORMAT_OPTIONS = [
  { value: "png", label: "PNG" },
  { value: "jpg", label: "JPEG" },
  { value: "webp", label: "WebP" },
  { value: "avif", label: "AVIF" },
  { value: "tiff", label: "TIFF" },
  { value: "gif", label: "GIF" },
  { value: "heic", label: "HEIC" },
  { value: "heif", label: "HEIF" },
  { value: "jxl", label: "JXL" },
];

const DPI_PRESETS = [
  { value: 72, label: "72" },
  { value: 150, label: "150" },
  { value: 300, label: "300" },
  { value: 600, label: "600" },
];

const DPI_LABELS: Record<number, string> = {
  72: "Screen",
  150: "Standard",
  300: "Print",
  600: "High Quality",
};

const COLOR_MODE_OPTIONS = [
  { value: "color", label: "Color" },
  { value: "grayscale", label: "Grayscale" },
  { value: "bw", label: "B&W" },
] as const;

const LOSSY_FORMATS = ["jpg", "webp", "avif", "heic", "heif", "jxl"];

export function PdfToImageSettings() {
  const { t } = useTranslation();
  const store = usePdfToImageStore();
  const file = useFileStore((s) => s.entries[s.selectedIndex]?.file);

  useEffect(() => {
    if (file && file !== store.file) {
      store.setFile(file);
      store.loadPreview(file);
    }
  }, [file, store]);

  const isLossy = LOSSY_FORMATS.includes(store.format);
  const selectedCount = store.selectedPages.size;

  return (
    <div className="space-y-4">
      {/* PDF info */}
      {store.file && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{store.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {store.loadingPreview ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Reading PDF...
                </span>
              ) : store.pageCount !== null ? (
                `${store.pageCount} page${store.pageCount !== 1 ? "s" : ""}`
              ) : null}
            </p>
          </div>
        </div>
      )}

      {/* Output Format - grid buttons */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">
          {t.toolSettings["pdf-to-image"].outputFormat}
        </p>
        <div className="grid grid-cols-4 gap-1">
          {FORMAT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => store.setFormat(opt.value)}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                store.format === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quality slider (lossy formats only) */}
      {isLossy && (
        <div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {t.toolSettings["pdf-to-image"].quality}
            </p>
            <span className="text-xs font-mono text-foreground">{store.quality}</span>
          </div>
          <input
            type="range"
            min={1}
            max={100}
            value={store.quality}
            onChange={(e) => store.setQuality(Number(e.target.value))}
            className="w-full mt-1"
          />
        </div>
      )}

      {/* DPI presets + custom */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">
          {t.toolSettings["pdf-to-image"].resolutionDpi}
        </p>
        <div className="grid grid-cols-5 gap-1">
          {DPI_PRESETS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                store.setDpi(opt.value);
                store.setCustomDpi(false);
              }}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                store.dpi === opt.value && !store.customDpi
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => store.setCustomDpi(true)}
            className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
              store.customDpi
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Custom
          </button>
        </div>
        {store.customDpi ? (
          <input
            type="number"
            min={36}
            max={1200}
            value={store.dpi}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 36 && v <= 1200) store.setDpi(v);
            }}
            className="w-full mt-1.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground"
          />
        ) : (
          <p className="text-xs text-muted-foreground mt-1">{DPI_LABELS[store.dpi] ?? ""}</p>
        )}
      </div>

      {/* Color Mode */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">
          {t.toolSettings["pdf-to-image"].colorMode}
        </p>
        <div className="grid grid-cols-3 gap-1">
          {COLOR_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => store.setColorMode(opt.value)}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                store.colorMode === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Page range input */}
      <div>
        <label htmlFor="pdf-pages" className="text-xs text-muted-foreground">
          {t.toolSettings["pdf-to-image"].pages}
        </label>
        <input
          id="pdf-pages"
          type="text"
          value={store.pages}
          onChange={(e) => store.setPages(e.target.value)}
          placeholder="All pages"
          className="w-full mt-0.5 px-2 py-1.5 rounded border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground"
        />
        {store.pageCount !== null && (
          <p className="text-xs text-muted-foreground mt-1">
            e.g. 1-3, 5, 8-10 (document has {store.pageCount} pages)
          </p>
        )}
      </div>

      {/* Error */}
      {store.error && <p className="text-xs text-destructive-ink">{store.error}</p>}

      {/* Convert button */}
      <button
        type="button"
        data-testid="pdf-to-image-submit"
        onClick={() => store.convert()}
        disabled={!store.file || !store.pageCount || store.processing || selectedCount === 0}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {store.processing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {store.processing
          ? t.toolSettings["pdf-to-image"].converting
          : `Convert ${selectedCount} page${selectedCount !== 1 ? "s" : ""}`}
      </button>

      {/* Download ZIP */}
      {store.zipUrl && (
        <a
          href={store.zipUrl}
          download="pdf-pages.zip"
          data-testid="pdf-to-image-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary-ink font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download All (ZIP)
          {store.zipSize != null && (
            <span className="text-xs opacity-70">
              {store.zipSize < 1024 * 1024
                ? `${(store.zipSize / 1024).toFixed(0)} KB`
                : `${(store.zipSize / (1024 * 1024)).toFixed(1)} MB`}
            </span>
          )}
        </a>
      )}
    </div>
  );
}
