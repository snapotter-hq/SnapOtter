import { Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";

export function HtmlToImageSettings() {
  const store = useHtmlToImageStore();
  const { t } = useTranslation();
  const ts = t.toolSettings["html-to-image"];

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      store.capture();
    },
    [store],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => store.setMode("url")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            store.mode === "url"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {ts.modeUrl}
        </button>
        <button
          type="button"
          onClick={() => store.setMode("html")}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            store.mode === "html"
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {ts.modeHtml}
        </button>
      </div>

      {store.mode === "url" && (
        <div>
          <label className="mb-1 block text-sm font-medium">{ts.url}</label>
          <input
            type="url"
            value={store.url}
            onChange={(e) => store.setUrl(e.target.value)}
            placeholder={ts.urlPlaceholder}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      )}

      {store.mode === "html" && (
        <div>
          <label className="mb-1 block text-sm font-medium">{ts.htmlFile}</label>
          <input
            type="file"
            accept=".html,.htm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                file.text().then((text) => store.setHtmlContent(text));
              }
            }}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-sm file:font-medium file:text-primary-foreground"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">{ts.format}</label>
        <select
          value={store.format}
          onChange={(e) => store.setFormat(e.target.value as "jpg" | "png" | "webp")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="png">PNG</option>
          <option value="jpg">JPG</option>
          <option value="webp">WebP</option>
        </select>
      </div>

      {store.format !== "png" && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            {ts.quality}: {store.quality}%
          </label>
          <input
            type="range"
            min={1}
            max={100}
            value={store.quality}
            onChange={(e) => store.setQuality(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">{ts.devicePreset}</label>
        <select
          value={store.devicePreset}
          onChange={(e) =>
            store.setDevicePreset(e.target.value as "desktop" | "tablet" | "mobile" | "custom")
          }
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="desktop">{ts.presets.desktop}</option>
          <option value="tablet">{ts.presets.tablet}</option>
          <option value="mobile">{ts.presets.mobile}</option>
          <option value="custom">{ts.presets.custom}</option>
        </select>
      </div>

      {store.devicePreset === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{ts.viewportWidth}</label>
            <input
              type="number"
              min={320}
              max={3840}
              value={store.viewportWidth}
              onChange={(e) => store.setViewportWidth(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{ts.viewportHeight}</label>
            <input
              type="number"
              min={320}
              max={2160}
              value={store.viewportHeight}
              onChange={(e) => store.setViewportHeight(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{ts.fullPage}</label>
        <button
          type="button"
          role="switch"
          aria-checked={store.fullPage}
          onClick={() => store.setFullPage(!store.fullPage)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            store.fullPage ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
              store.fullPage ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {store.error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {store.error}
        </div>
      )}

      <button
        type="submit"
        disabled={(store.mode === "url" ? !store.url : !store.htmlContent) || store.capturing}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {store.capturing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {store.capturing ? ts.capturing : ts.submit}
      </button>
    </form>
  );
}
