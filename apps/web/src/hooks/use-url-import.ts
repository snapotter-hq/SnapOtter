import { useCallback, useRef, useState } from "react";
import { useTranslation } from "@/contexts/i18n-context";
import { failedAnswerMessage, formatHeaders } from "@/lib/api";
import { appUrl, resolveServerUrls } from "@/lib/app-url";

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

export type AddReadyFilesResult = File[] & {
  failedCount: number;
  fulfilledIndices: number[];
};

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
  const entriesRef = useRef<UrlImportEntry[]>(entries);
  entriesRef.current = entries;
  const abortRef = useRef<AbortController | null>(null);
  const singleAbortRef = useRef<AbortController | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const retryAbortRef = useRef<Map<string, AbortController>>(new Map());
  const { t } = useTranslation();

  // -- helpers --

  const abortRetries = useCallback(() => {
    for (const controller of retryAbortRef.current.values()) {
      controller.abort();
    }
    retryAbortRef.current.clear();
  }, []);

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
        const body = await res.json().catch(() => null);
        throw new Error(failedAnswerMessage(t, body, res.status, `Fetch failed: ${res.status}`));
      }
      return resolveServerUrls(await res.json());
    },
    [t],
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
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(failedAnswerMessage(t, body, res.status, `Download failed: ${res.status}`));
      }
      const blob = await res.blob();
      return new File([blob], filename, { type: blob.type });
    },
    [t],
  );

  // -- public API --

  const importUrls = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return;

      abortRef.current?.abort();
      downloadAbortRef.current?.abort();
      downloadAbortRef.current = null;
      abortRetries();
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
    [fetchUrls, resultToEntry, abortRetries],
  );

  const importSingleUrl = useCallback(
    async (url: string): Promise<File | null> => {
      singleAbortRef.current?.abort();
      const controller = new AbortController();
      singleAbortRef.current = controller;
      try {
        const { results } = await fetchUrls([url], controller.signal);
        if (controller.signal.aborted) return null;
        const result = results[0];
        if (!result?.success || !result.downloadUrl || !result.filename) {
          throw new Error(result?.error ? result.error : t.dropzone.urlFetchFailed);
        }
        const file = await downloadAsFile(result.downloadUrl, result.filename, controller.signal);
        if (controller.signal.aborted) return null;
        return file;
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          return null;
        }
        throw err;
      } finally {
        if (singleAbortRef.current === controller) {
          singleAbortRef.current = null;
        }
      }
    },
    [fetchUrls, downloadAsFile, t.dropzone.urlFetchFailed],
  );

  const addReadyFiles = useCallback(async (): Promise<AddReadyFilesResult> => {
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;

    const readyWithIndex: Array<{
      index: number;
      entry: UrlImportEntry & { downloadUrl: string; filename: string };
    }> = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.status === "ready" && e.downloadUrl && e.filename) {
        readyWithIndex.push({
          index: i,
          entry: e as UrlImportEntry & { downloadUrl: string; filename: string },
        });
      }
    }

    const settled = await Promise.allSettled(
      readyWithIndex.map(({ entry }) =>
        downloadAsFile(entry.downloadUrl, entry.filename, controller.signal),
      ),
    );

    if (controller.signal.aborted) {
      return Object.assign([] as File[], { failedCount: 0, fulfilledIndices: [] as number[] });
    }

    const files: File[] = [];
    const fulfilledIndices: number[] = [];
    const failedByIndex = new Map<number, string>();

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const { index } = readyWithIndex[i];
      if (outcome.status === "fulfilled") {
        files.push(outcome.value);
        fulfilledIndices.push(index);
      } else {
        const reason = outcome.reason;
        const message = reason instanceof Error ? reason.message : String(reason);
        failedByIndex.set(index, message);
      }
    }

    if (failedByIndex.size > 0) {
      setEntries((prev) =>
        prev.map((entry, idx) => {
          const error = failedByIndex.get(idx);
          return error !== undefined ? { ...entry, status: "failed" as const, error } : entry;
        }),
      );
    }

    return Object.assign(files, {
      failedCount: failedByIndex.size,
      fulfilledIndices,
    });
  }, [entries, downloadAsFile]);

  const removeEntries = useCallback((indices: ReadonlySet<number> | readonly number[]) => {
    const toRemove = indices instanceof Set ? indices : new Set(indices);
    if (toRemove.size === 0) return;
    setEntries((prev) => prev.filter((_, idx) => !toRemove.has(idx)));
  }, []);

  const retryUrl = useCallback(
    async (index: number) => {
      const targetUrl = entriesRef.current[index]?.url;
      if (!targetUrl) return;

      retryAbortRef.current.get(targetUrl)?.abort();
      const controller = new AbortController();
      retryAbortRef.current.set(targetUrl, controller);

      setEntries((prev) =>
        prev.map((e) =>
          e.url === targetUrl ? { ...e, status: "fetching" as const, error: undefined } : e,
        ),
      );

      try {
        const { results } = await fetchUrls([targetUrl], controller.signal);
        if (controller.signal.aborted) return;
        const result = results[0];
        if (!result) {
          setEntries((prev) =>
            prev.map((e) =>
              e.url === targetUrl
                ? { ...e, status: "failed" as const, error: t.urlImport.failedStatus }
                : e,
            ),
          );
          return;
        }

        setEntries((prev) => prev.map((e) => (e.url === targetUrl ? resultToEntry(result) : e)));
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setEntries((prev) =>
          prev.map((e) =>
            e.url === targetUrl ? { ...e, status: "failed" as const, error: message } : e,
          ),
        );
      } finally {
        if (retryAbortRef.current.get(targetUrl) === controller) {
          retryAbortRef.current.delete(targetUrl);
        }
      }
    },
    [fetchUrls, resultToEntry, t.urlImport.failedStatus],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    singleAbortRef.current?.abort();
    singleAbortRef.current = null;
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    abortRetries();
    setEntries([]);
    setImporting(false);
  }, [abortRetries]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    singleAbortRef.current?.abort();
    singleAbortRef.current = null;
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    abortRetries();
    setEntries([]);
    setImporting(false);
  }, [abortRetries]);

  // -- derived counts --

  const readyCount = entries.filter((e) => e.status === "ready").length;
  const failedCount = entries.filter((e) => e.status === "failed").length;

  return {
    entries,
    importing,
    importUrls,
    importSingleUrl,
    addReadyFiles,
    removeEntries,
    retryUrl,
    cancel,
    reset,
    readyCount,
    failedCount,
  };
}
