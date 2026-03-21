import { useState } from "react";
import { useFileStore } from "@/stores/file-store";
import { Loader2 } from "lucide-react";

function getToken(): string {
  return localStorage.getItem("stirling-token") || "";
}

interface DuplicateGroup {
  files: Array<{ filename: string; similarity: number }>;
}

interface DuplicateResult {
  totalImages: number;
  duplicateGroups: DuplicateGroup[];
  uniqueImages: number;
}

export function FindDuplicatesSettings() {
  const { files, processing, error, setProcessing, setError } = useFileStore();
  const [result, setResult] = useState<DuplicateResult | null>(null);

  const handleProcess = async () => {
    if (files.length < 2) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append("file", file);
      }

      const res = await fetch("/api/v1/tools/find-duplicates", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }

      const data: DuplicateResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Detection failed");
    } finally {
      setProcessing(false);
    }
  };

  const hasFiles = files.length >= 2;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload 2 or more images to find near-duplicates using perceptual hashing.
      </p>

      <button
        onClick={handleProcess}
        disabled={!hasFiles || processing}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing && <Loader2 className="h-4 w-4 animate-spin" />}
        {processing ? "Scanning..." : `Scan ${files.length} Images`}
      </button>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {result && (
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted text-xs space-y-1">
            <p className="text-foreground">Total images: {result.totalImages}</p>
            <p className="text-foreground">Unique images: {result.uniqueImages}</p>
            <p className="text-foreground">Duplicate groups: {result.duplicateGroups.length}</p>
          </div>

          {result.duplicateGroups.length === 0 ? (
            <p className="text-xs text-muted-foreground">No duplicates found.</p>
          ) : (
            result.duplicateGroups.map((group, gi) => (
              <div key={gi} className="p-2 rounded border border-border space-y-1">
                <p className="text-xs font-medium text-foreground">Group {gi + 1}</p>
                {group.files.map((f, fi) => (
                  <div key={fi} className="flex justify-between text-xs">
                    <span className="text-foreground truncate">{f.filename}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">{f.similarity}%</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
