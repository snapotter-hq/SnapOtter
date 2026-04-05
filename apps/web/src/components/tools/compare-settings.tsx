import { Download, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";
export function CompareSettings() {
  const { files, processing, error, setProcessing, setError, setProcessedUrl } = useFileStore();
  const [secondFile, setSecondFile] = useState<File | null>(null);
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const secondInputRef = useRef<HTMLInputElement>(null);

  const handleProcess = async () => {
    if (files.length === 0 || !secondFile) return;

    setProcessing(true);
    setError(null);
    setDownloadUrl(null);
    setSimilarity(null);

    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("file", secondFile);

      const res = await fetch("/api/v1/tools/compare", {
        method: "POST",
        headers: formatHeaders(),
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const result = await res.json();
      setSimilarity(result.similarity);
      setDownloadUrl(result.downloadUrl);
      setProcessedUrl(result.downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFile = files.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="compare-second-image" className="text-xs text-muted-foreground">
          Second Image
        </label>
        <input
          id="compare-second-image"
          ref={secondInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => setSecondFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => secondInputRef.current?.click()}
          className="w-full mt-0.5 px-2 py-2 rounded border border-dashed border-border bg-background text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Upload className="h-4 w-4" />
          {secondFile ? secondFile.name : "Choose second image"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {similarity !== null && (
        <div className="p-3 rounded-lg bg-muted">
          <p className="text-sm text-foreground font-medium">
            Similarity: {similarity.toFixed(1)}%
          </p>
          <div className="mt-1 h-2 bg-background rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${similarity}%` }} />
          </div>
        </div>
      )}

      <button
        type="button"
        data-testid="compare-submit"
        onClick={handleProcess}
        disabled={!hasFile || !secondFile || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Comparing..." : "Compare"}
      </button>

      {downloadUrl && (
        <a
          href={downloadUrl}
          download
          data-testid="compare-download"
          className="w-full py-2.5 rounded-lg border border-primary text-primary font-medium flex items-center justify-center gap-2 hover:bg-primary/5"
        >
          <Download className="h-4 w-4" />
          Download Diff Image
        </a>
      )}
    </div>
  );
}
