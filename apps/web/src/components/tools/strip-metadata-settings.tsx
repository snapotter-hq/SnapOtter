import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { Download, Loader2 } from "lucide-react";

export function StripMetadataSettings() {
  const { files } = useFileStore();
  const { processFiles, processing, error, downloadUrl, originalSize, processedSize } =
    useToolProcessor("strip-metadata");

  const [stripAll, setStripAll] = useState(true);
  const [stripExif, setStripExif] = useState(false);
  const [stripGps, setStripGps] = useState(false);
  const [stripIcc, setStripIcc] = useState(false);
  const [stripXmp, setStripXmp] = useState(false);

  const handleStripAllChange = (checked: boolean) => {
    setStripAll(checked);
    if (checked) {
      setStripExif(false);
      setStripGps(false);
      setStripIcc(false);
      setStripXmp(false);
    }
  };

  const handleProcess = () => {
    processFiles(files, { stripAll, stripExif, stripGps, stripIcc, stripXmp });
  };

  const hasFile = files.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasFile && !processing) handleProcess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Strip All */}
      <label className="flex items-center gap-2 text-sm text-foreground font-medium">
        <input
          type="checkbox"
          checked={stripAll}
          onChange={(e) => handleStripAllChange(e.target.checked)}
          className="rounded"
        />
        Strip All Metadata
      </label>

      <div className="border-t border-border" />

      {/* Individual options */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Or select specific metadata:</label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripExif}
            onChange={(e) => setStripExif(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip EXIF (camera info, date, exposure)
        </label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripGps}
            onChange={(e) => setStripGps(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip GPS (location data)
        </label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripIcc}
            onChange={(e) => setStripIcc(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip ICC (color profile)
        </label>

        <label className={`flex items-center gap-2 text-sm ${stripAll ? "text-muted-foreground" : "text-foreground"}`}>
          <input
            type="checkbox"
            checked={stripXmp}
            onChange={(e) => setStripXmp(e.target.checked)}
            disabled={stripAll}
            className="rounded"
          />
          Strip XMP (extensible metadata)
        </label>
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Size info */}
      {originalSize != null && processedSize != null && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>Original: {(originalSize / 1024).toFixed(1)} KB</p>
          <p>Processed: {(processedSize / 1024).toFixed(1)} KB</p>
          <p>Metadata removed: {((originalSize - processedSize) / 1024).toFixed(1)} KB</p>
        </div>
      )}

      {/* Process */}
      <button
        type="submit"
        disabled={!hasFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Processing..." : "Strip Metadata"}
      </button>

      {/* Download */}
      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download
        </a>
      )}
    </form>
  );
}
