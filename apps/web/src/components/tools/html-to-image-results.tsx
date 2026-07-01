import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "@/contexts/i18n-context";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";

export function HtmlToImageResults() {
  const store = useHtmlToImageStore();
  const { t } = useTranslation();
  const ts = t.toolSettings["html-to-image"];

  if (store.capturing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">{ts.capturing}</p>
      </div>
    );
  }

  if (!store.resultUrl) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">{ts.placeholder}</p>
      </div>
    );
  }

  const resultUrl = store.resultUrl;

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `screenshot.${store.format}`;
    a.click();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-4">
        <img
          src={resultUrl}
          alt="Captured screenshot"
          className="mx-auto max-w-full rounded-lg border border-border shadow-sm"
        />
      </div>
      <div className="flex items-center justify-between border-t border-border p-4">
        <span className="text-sm text-muted-foreground">
          {store.resultSize != null
            ? store.resultSize >= 1024 * 1024
              ? `${(store.resultSize / (1024 * 1024)).toFixed(1)} MB`
              : `${(store.resultSize / 1024).toFixed(1)} KB`
            : ""}
        </span>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          <Download className="h-4 w-4" />
          {ts.download}
        </button>
      </div>
    </div>
  );
}
