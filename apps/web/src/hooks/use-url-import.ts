import { useCallback, useRef, useState } from "react";
import { formatHeaders } from "@/lib/api";
import { appUrl } from "@/lib/app-url";

// ── Types ──────────────────────────────────────────────────────

export interface UrlImportEntry {
  url: string;
  status: "pending" | "fetching" | "ready" | "failed";
  filename?: string;
  size?: number;
  width?: number;
  height?: number;
  downloadUrl?: string;
  previewUrl?: string | null;
  error?: string;
}

interface FetchUrlResult {
  success: boolean;
  url: string;
  filename?: string;
  contentType?: string;
  size?: number;
  width?: number;
  height?: number;
  downloadUrl?: string;
  previewUrl?: string | null;
  error?: string;
}

interface FetchUrlsResponse {
  results: FetchUrlResult[];
}

// ── Hook ───────────────────────────────────────────────────────

export function useUrlImport() {
  const [entries, setEntries] = useState<UrlImportEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // -- helpers --

  const fetchUrls = useCallback(
    async (urls: string[], signal?: AbortSignal): Promise<FetchUrlsResponse> => {
      const headers = formatHeaders();
      headers.set("Content-Type", "application/json");
      const res = await fetch(appUrl("/api/v1/fetch-urls"), {
        method: "POST",
        headers,
        body: JSON.stringify({ urls }),
        signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error || `Fetch failed: ${res.status}`);
      }
      return res.json();
    },
    [],
  );

  const resultToEntry = useCallback((result: FetchUrlResult): UrlImportEntry => {
    if (result.success) {
      return {
        url: result.url,
        status: "ready",
        filename: result.filename,
        size: result.size,
        width: result.width,
        height: result.height,
        downloadUrl: result.downloadUrl,
        previewUrl: result.previewUrl,
      };
    }
    return {
      url: result.url,
      status: "failed",
      error: result.error,
    };
  }, []);

  const downloadAsFile = useCallback(
    async (downloadUrl: string, filename: string, signal?: AbortSignal): Promise<File> => {
      const res = await fetch(downloadUrl, { headers: formatHeaders(), signal });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type });
    },
    [],
  );

  // -- public API --

  const importUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setEntries(urls.map((url) => ({ url, status: "fetching" })));
      setImporting(true);

      try {
        const { results } = await fetchUrls(urls, controller.signal);

        if (controller.signal.aborted) return;

        setEntries(results.map(resultToEntry));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setEntries(
          urls.map((url) => ({
            url,
            status: "failed" as const,
            error: (err as Error).message,
          })),
        );
      } finally {
        if (!controller.signal.aborted) {
          setImporting(false);
        }
      }
    },
    [fetchUrls, resultToEntry],
  );

  const importSingleUrl = useCallback(
    async (url: string): Promise<File | null> => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const { results } = await fetchUrls([url], controller.signal);
        const result = results[0];
        if (!result?.success || !result.downloadUrl || !result.filename) return null;
        return await downloadAsFile(result.downloadUrl, result.filename, controller.signal);
      } catch {
        return null;
      }
    },
    [fetchUrls, downloadAsFile],
  );

  const addReadyFiles = useCallback(async (): Promise<File[]> => {
    const ready = entries.filter(
      (e): e is UrlImportEntry & { downloadUrl: string; filename: string } =>
        e.status === "ready" && !!e.downloadUrl && !!e.filename,
    );

    const settled = await Promise.allSettled(
      ready.map((e) => downloadAsFile(e.downloadUrl, e.filename)),
    );

    return settled
      .filter((r): r is PromiseFulfilledResult<File> => r.status === "fulfilled")
      .map((r) => r.value);
  }, [entries, downloadAsFile]);

  const retryUrl = useCallback(
    async (index: number) => {
      let url: string | undefined;
      setEntries((prev) => {
        url = prev[index]?.url;
        if (!url) return prev;
        return prev.map((e, i) =>
          i === index ? { ...e, status: "fetching" as const, error: undefined } : e,
        );
      });
      if (!url) return;

      try {
        const { results } = await fetchUrls([url]);
        const result = results[0];
        if (!result) return;

        setEntries((prev) => prev.map((e, i) => (i === index ? resultToEntry(result) : e)));
      } catch (err) {
        setEntries((prev) =>
          prev.map((e, i) =>
            i === index ? { ...e, status: "failed" as const, error: (err as Error).message } : e,
          ),
        );
      }
    },
    [fetchUrls, resultToEntry],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setEntries([]);
    setImporting(false);
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setImporting(false);
  }, []);

  // -- derived counts --

  const readyCount = entries.filter((e) => e.status === "ready").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;

  return {
    entries,
    importing,
    importUrls,
    importSingleUrl,
    addReadyFiles,
    retryUrl,
    cancel,
    reset,
    readyCount,
    failedCount,
  };
}
