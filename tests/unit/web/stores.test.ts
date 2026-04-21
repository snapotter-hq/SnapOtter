// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Global mocks that must exist BEFORE the modules under test are imported
// ---------------------------------------------------------------------------

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn((_obj: Blob | MediaSource) => "blob:fake-url");

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL,
  revokeObjectURL,
});

// fetch is mocked per-test; start with a stub so the module can load
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// localStorage mock (jsdom provides one, but we need spy access)
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, val: string) => storageMap.set(key, val)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() {
    return storageMap.size;
  },
  key: vi.fn((_i: number) => null),
};
vi.stubGlobal("localStorage", localStorageMock);

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  apiDelete,
  apiDownloadBlob,
  apiGet,
  apiPost,
  apiPut,
  apiUpload,
  clearToken,
  getDownloadUrl,
  setToken,
} from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, size = 1024, type = "image/png"): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type });
}

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    blob: () => Promise.resolve(new Blob(["bytes"])),
  } as unknown as Response);
}

function failResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error("no body")),
    blob: () => Promise.resolve(new Blob()),
  } as unknown as Response);
}

// ==========================================================================
// FileStore
// ==========================================================================

describe("FileStore", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
    vi.clearAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    // Reset the mock to return incrementing URLs
    let urlCounter = 0;
    createObjectURL.mockImplementation((_obj: Blob | MediaSource) => `blob:url-${++urlCounter}`);
  });

  // -- Initial state -------------------------------------------------------

  it("has correct initial state", () => {
    const s = useFileStore.getState();
    expect(s.entries).toEqual([]);
    expect(s.selectedIndex).toBe(0);
    expect(s.batchZipBlob).toBeNull();
    expect(s.batchZipFilename).toBeNull();
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
  });

  // -- setFiles -------------------------------------------------------------

  it("setFiles creates entries with blob URLs", () => {
    const f1 = makeFile("a.png", 100);
    const f2 = makeFile("b.png", 200);
    useFileStore.getState().setFiles([f1, f2]);

    const s = useFileStore.getState();
    expect(s.entries).toHaveLength(2);
    expect(s.entries[0].file).toBe(f1);
    expect(s.entries[0].blobUrl).toBe("blob:url-1");
    expect(s.entries[0].originalSize).toBe(100);
    expect(s.entries[0].status).toBe("pending");
    expect(s.entries[0].processedUrl).toBeNull();
    expect(s.entries[0].processedSize).toBeNull();
    expect(s.entries[0].error).toBeNull();
    expect(s.entries[1].file).toBe(f2);
    expect(s.entries[1].blobUrl).toBe("blob:url-2");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("setFiles revokes old blob URLs", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const oldUrl = useFileStore.getState().entries[0].blobUrl;
    revokeObjectURL.mockClear();

    useFileStore.getState().setFiles([makeFile("b.png")]);
    expect(revokeObjectURL).toHaveBeenCalledWith(oldUrl);
  });

  it("setFiles clears on empty array", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    revokeObjectURL.mockClear();
    const oldUrl = useFileStore.getState().entries[0].blobUrl;

    useFileStore.getState().setFiles([]);
    expect(useFileStore.getState().entries).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith(oldUrl);
  });

  it("setFiles resets selectedIndex to 0", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);
    expect(useFileStore.getState().selectedIndex).toBe(1);

    useFileStore.getState().setFiles([makeFile("c.png")]);
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  it("setFiles clears error", () => {
    useFileStore.getState().setError("old error");
    useFileStore.getState().setFiles([makeFile("a.png")]);
    expect(useFileStore.getState().error).toBeNull();
  });

  // -- addFiles -------------------------------------------------------------

  it("addFiles appends new entries without revoking existing", () => {
    useFileStore.getState().setFiles([makeFile("a.png", 100)]);
    revokeObjectURL.mockClear();
    createObjectURL.mockClear();

    const f2 = makeFile("b.png", 200);
    useFileStore.getState().addFiles([f2]);

    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(useFileStore.getState().entries).toHaveLength(2);
    expect(useFileStore.getState().entries[1].file).toBe(f2);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  // -- removeFile -----------------------------------------------------------

  it("removeFile removes entry and revokes its blob URLs", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    const removedUrl = useFileStore.getState().entries[0].blobUrl;
    revokeObjectURL.mockClear();

    useFileStore.getState().removeFile(0);
    expect(useFileStore.getState().entries).toHaveLength(1);
    expect(useFileStore.getState().entries[0].file.name).toBe("b.png");
    expect(revokeObjectURL).toHaveBeenCalledWith(removedUrl);
  });

  it("removeFile adjusts selectedIndex when removing before it", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);
    useFileStore.getState().setSelectedIndex(2);

    useFileStore.getState().removeFile(0);
    expect(useFileStore.getState().selectedIndex).toBe(1);
  });

  it("removeFile clamps selectedIndex if it was the last entry", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);

    useFileStore.getState().removeFile(1);
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  it("removeFile revokes processedUrl if present", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: "blob:processed",
      status: "completed",
    });
    revokeObjectURL.mockClear();

    useFileStore.getState().removeFile(0);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:processed");
  });

  // -- Navigation -----------------------------------------------------------

  it("navigateNext advances selectedIndex", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    expect(useFileStore.getState().selectedIndex).toBe(0);

    useFileStore.getState().navigateNext();
    expect(useFileStore.getState().selectedIndex).toBe(1);
  });

  it("navigateNext does not exceed bounds", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);

    useFileStore.getState().navigateNext();
    expect(useFileStore.getState().selectedIndex).toBe(1);
  });

  it("navigatePrev decrements selectedIndex", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);

    useFileStore.getState().navigatePrev();
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  it("navigatePrev does not go below 0", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().navigatePrev();
    expect(useFileStore.getState().selectedIndex).toBe(0);
  });

  // -- updateEntry ----------------------------------------------------------

  it("updateEntry merges partial data into the entry at index", () => {
    useFileStore.getState().setFiles([makeFile("a.png", 500)]);
    useFileStore.getState().updateEntry(0, {
      status: "completed",
      processedUrl: "blob:done",
      processedSize: 250,
    });

    const entry = useFileStore.getState().entries[0];
    expect(entry.status).toBe("completed");
    expect(entry.processedUrl).toBe("blob:done");
    expect(entry.processedSize).toBe(250);
    expect(entry.file.name).toBe("a.png"); // unchanged
  });

  // -- setBatchZip ----------------------------------------------------------

  it("setBatchZip stores blob and filename", () => {
    const blob = new Blob(["zip-data"]);
    useFileStore.getState().setBatchZip(blob, "results.zip");

    const s = useFileStore.getState();
    expect(s.batchZipBlob).toBe(blob);
    expect(s.batchZipFilename).toBe("results.zip");
  });

  // -- undoProcessing -------------------------------------------------------

  it("undoProcessing resets all entries to pending and revokes processed blob URLs", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().updateEntry(0, {
      status: "completed",
      processedUrl: "blob:proc-a",
      processedSize: 50,
    });
    useFileStore.getState().updateEntry(1, {
      status: "completed",
      processedUrl: "blob:proc-b",
      processedSize: 75,
    });
    revokeObjectURL.mockClear();

    useFileStore.getState().undoProcessing();

    const s = useFileStore.getState();
    // All entries reset to pending
    expect(s.entries[0].status).toBe("pending");
    expect(s.entries[0].processedUrl).toBeNull();
    expect(s.entries[0].processedSize).toBeNull();
    expect(s.entries[0].error).toBeNull();
    expect(s.entries[1].status).toBe("pending");
    expect(s.entries[1].processedUrl).toBeNull();
    // Processed URLs revoked
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:proc-a");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:proc-b");
  });

  it("undoProcessing keeps original blob URLs", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const origUrl = useFileStore.getState().entries[0].blobUrl;
    revokeObjectURL.mockClear();

    useFileStore.getState().undoProcessing();
    // Should NOT revoke original blob URL
    expect(revokeObjectURL).not.toHaveBeenCalledWith(origUrl);
    expect(useFileStore.getState().entries[0].blobUrl).toBe(origUrl);
  });

  // -- reset ----------------------------------------------------------------

  it("reset clears everything and revokes all blob URLs", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:proc" });
    const origUrl0 = useFileStore.getState().entries[0].blobUrl;
    const origUrl1 = useFileStore.getState().entries[1].blobUrl;
    revokeObjectURL.mockClear();

    useFileStore.getState().reset();

    expect(revokeObjectURL).toHaveBeenCalledWith(origUrl0);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:proc");
    expect(revokeObjectURL).toHaveBeenCalledWith(origUrl1);

    const s = useFileStore.getState();
    expect(s.entries).toEqual([]);
    expect(s.selectedIndex).toBe(0);
    expect(s.batchZipBlob).toBeNull();
    expect(s.batchZipFilename).toBeNull();
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
  });

  it("reset with no entries does not call revokeObjectURL", () => {
    revokeObjectURL.mockClear();
    useFileStore.getState().reset();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  // -- Backward compat getters ----------------------------------------------

  it("files getter maps entries to File[]", () => {
    const f1 = makeFile("a.png");
    const f2 = makeFile("b.png");
    useFileStore.getState().setFiles([f1, f2]);

    const s = useFileStore.getState();
    expect(s.files).toEqual([f1, f2]);
    expect(s.files[0]).toBe(f1);
  });

  it("currentEntry returns entry at selectedIndex", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);

    expect(useFileStore.getState().currentEntry?.file.name).toBe("b.png");
  });

  it("currentEntry returns undefined when no entries", () => {
    expect(useFileStore.getState().currentEntry).toBeUndefined();
  });

  it("selectedFileName returns current entry file name", () => {
    useFileStore.getState().setFiles([makeFile("photo.png")]);
    expect(useFileStore.getState().selectedFileName).toBe("photo.png");
  });

  it("selectedFileName returns null when no entries", () => {
    expect(useFileStore.getState().selectedFileName).toBeNull();
  });

  it("selectedFileSize returns current entry file size", () => {
    useFileStore.getState().setFiles([makeFile("photo.png", 2048)]);
    expect(useFileStore.getState().selectedFileSize).toBe(2048);
  });

  it("selectedFileSize returns null when no entries", () => {
    expect(useFileStore.getState().selectedFileSize).toBeNull();
  });

  it("originalBlobUrl returns current entry blobUrl", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    expect(useFileStore.getState().originalBlobUrl).toBe(
      useFileStore.getState().entries[0].blobUrl,
    );
  });

  it("originalBlobUrl returns null when no entries", () => {
    expect(useFileStore.getState().originalBlobUrl).toBeNull();
  });

  it("processedUrl returns current entry processedUrl", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:done" });
    expect(useFileStore.getState().processedUrl).toBe("blob:done");
  });

  it("originalSize returns current entry originalSize", () => {
    useFileStore.getState().setFiles([makeFile("a.png", 999)]);
    expect(useFileStore.getState().originalSize).toBe(999);
  });

  it("processedSize returns current entry processedSize", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().updateEntry(0, { processedSize: 500 });
    expect(useFileStore.getState().processedSize).toBe(500);
  });

  it("entries.length reflects file count", () => {
    expect(useFileStore.getState().entries.length).toBe(0);
    useFileStore.getState().setFiles([makeFile("a.png")]);
    expect(useFileStore.getState().entries.length).toBe(1);
  });

  it("all entries completed can be derived from entries", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    const allDone = () =>
      useFileStore.getState().entries.length > 0 &&
      useFileStore.getState().entries.every((e) => e.status === "completed");
    expect(allDone()).toBe(false);

    useFileStore.getState().updateEntry(0, { status: "completed" });
    expect(allDone()).toBe(false);

    useFileStore.getState().updateEntry(1, { status: "completed" });
    expect(allDone()).toBe(true);
  });

  it("empty entries means nothing is processed", () => {
    const allDone =
      useFileStore.getState().entries.length > 0 &&
      useFileStore.getState().entries.every((e) => e.status === "completed");
    expect(allDone).toBe(false);
  });

  // -- setProcessedUrl (backward compat, updates current entry) -------------

  it("setProcessedUrl updates current entry processedUrl and status", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessedUrl("blob:result");

    const entry = useFileStore.getState().entries[0];
    expect(entry.processedUrl).toBe("blob:result");
    expect(entry.status).toBe("completed");
  });

  it("setProcessedUrl with null resets current entry", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessedUrl("blob:result");
    useFileStore.getState().setProcessedUrl(null);

    const entry = useFileStore.getState().entries[0];
    expect(entry.processedUrl).toBeNull();
    expect(entry.status).toBe("pending");
  });

  // -- setSizes (backward compat, updates current entry) --------------------

  it("setSizes updates current entry sizes", () => {
    useFileStore.getState().setFiles([makeFile("a.png", 1000)]);
    useFileStore.getState().setSizes(1000, 500);

    const entry = useFileStore.getState().entries[0];
    expect(entry.originalSize).toBe(1000);
    expect(entry.processedSize).toBe(500);
  });

  // -- setJobId (no-op for compat) ------------------------------------------

  it("setJobId is a no-op (does not throw)", () => {
    expect(() => useFileStore.getState().setJobId("job-abc")).not.toThrow();
  });
});

// ==========================================================================
// API lib
// ==========================================================================

describe("API lib", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    storageMap.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  // -- Token management ----------------------------------------------------

  describe("token management", () => {
    it("setToken stores in localStorage under 'ashim-token'", () => {
      setToken("my-secret");
      expect(localStorageMock.setItem).toHaveBeenCalledWith("ashim-token", "my-secret");
      expect(storageMap.get("ashim-token")).toBe("my-secret");
    });

    it("clearToken removes 'ashim-token' from localStorage", () => {
      setToken("to-remove");
      clearToken();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("ashim-token");
      expect(storageMap.has("ashim-token")).toBe(false);
    });

    it("clearToken is idempotent (no throw when key missing)", () => {
      expect(() => clearToken()).not.toThrow();
    });
  });

  // -- apiGet ---------------------------------------------------------------

  describe("apiGet", () => {
    it("sends GET with Bearer token from localStorage", async () => {
      setToken("tok-123");
      fetchMock.mockReturnValueOnce(okJson({ data: "ok" }));

      const result = await apiGet<{ data: string }>("/v1/health");

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/health");
      expect(opts.headers.get("Authorization")).toBe("Bearer tok-123");
      expect(result).toEqual({ data: "ok" });
    });

    it("omits Authorization header when no token is set", async () => {
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/anything");

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1].headers.get("Authorization")).toBeNull();
    });

    it("throws on non-ok response (e.g., 401)", async () => {
      fetchMock.mockReturnValueOnce(failResponse(401));
      await expect(apiGet("/v1/secret")).rejects.toThrow("API error: 401");
    });

    it("throws on non-ok response (e.g., 500)", async () => {
      fetchMock.mockReturnValueOnce(failResponse(500));
      await expect(apiGet("/v1/broken")).rejects.toThrow("API error: 500");
    });

    it("throws when fetch itself rejects (network error)", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(apiGet("/v1/anything")).rejects.toThrow("Failed to fetch");
    });
  });

  // -- apiPost --------------------------------------------------------------

  describe("apiPost", () => {
    it("sends POST with JSON body and Bearer token", async () => {
      setToken("post-tok");
      fetchMock.mockReturnValueOnce(okJson({ id: 1 }));

      const result = await apiPost("/v1/items", { name: "test" });

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/items");
      expect(opts.method).toBe("POST");
      expect(opts.headers.get("Content-Type")).toBe("application/json");
      expect(opts.headers.get("Authorization")).toBe("Bearer post-tok");
      expect(opts.body).toBe(JSON.stringify({ name: "test" }));
      expect(result).toEqual({ id: 1 });
    });

    it("sends POST with undefined body when no body argument", async () => {
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiPost("/v1/trigger");

      const [, opts] = fetchMock.mock.calls[0];
      expect(opts.body).toBeUndefined();
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockReturnValueOnce(failResponse(422));
      await expect(apiPost("/v1/items", {})).rejects.toThrow("API error: 422");
    });
  });

  // -- apiPut ---------------------------------------------------------------

  describe("apiPut", () => {
    it("sends PUT with JSON body and Bearer token", async () => {
      setToken("put-tok");
      fetchMock.mockReturnValueOnce(okJson({ updated: true }));

      const result = await apiPut("/v1/items/1", { name: "updated" });

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/items/1");
      expect(opts.method).toBe("PUT");
      expect(opts.headers.get("Content-Type")).toBe("application/json");
      expect(opts.headers.get("Authorization")).toBe("Bearer put-tok");
      expect(opts.body).toBe(JSON.stringify({ name: "updated" }));
      expect(result).toEqual({ updated: true });
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockReturnValueOnce(failResponse(404));
      await expect(apiPut("/v1/items/999", {})).rejects.toThrow("API error: 404");
    });
  });

  // -- apiDelete ------------------------------------------------------------

  describe("apiDelete", () => {
    it("sends DELETE with Bearer token (no body)", async () => {
      setToken("del-tok");
      fetchMock.mockReturnValueOnce(okJson({ deleted: true }));

      const result = await apiDelete("/v1/items/1");

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/items/1");
      expect(opts.method).toBe("DELETE");
      expect(opts.headers.get("Authorization")).toBe("Bearer del-tok");
      expect(opts.body).toBeUndefined();
      expect(result).toEqual({ deleted: true });
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockReturnValueOnce(failResponse(403));
      await expect(apiDelete("/v1/items/1")).rejects.toThrow("API error: 403");
    });
  });

  // -- apiUpload ------------------------------------------------------------

  describe("apiUpload", () => {
    it("sends FormData with files to /api/v1/upload", async () => {
      setToken("up-tok");
      const payload = {
        jobId: "j1",
        files: [{ name: "img.png", size: 1024, format: "png" }],
      };
      fetchMock.mockReturnValueOnce(okJson(payload));

      const f = makeFile("img.png", 1024);
      const result = await apiUpload([f]);

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/upload");
      expect(opts.method).toBe("POST");
      expect(opts.headers.get("Authorization")).toBe("Bearer up-tok");
      // Body should be FormData
      expect(opts.body).toBeInstanceOf(FormData);
      const fd = opts.body as FormData;
      expect(fd.getAll("files")).toHaveLength(1);
      expect(result).toEqual(payload);
    });

    it("appends multiple files to FormData under the same 'files' key", async () => {
      fetchMock.mockReturnValueOnce(okJson({ jobId: "j2", files: [{}, {}] }));

      await apiUpload([makeFile("a.png"), makeFile("b.jpg")]);

      const fd = fetchMock.mock.calls[0][1].body as FormData;
      expect(fd.getAll("files")).toHaveLength(2);
    });

    it("does NOT set Content-Type (browser sets multipart boundary)", async () => {
      fetchMock.mockReturnValueOnce(okJson({ jobId: "j", files: [] }));
      await apiUpload([makeFile("x.png")]);

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers.get("Content-Type")).toBeNull();
    });

    it("throws on non-ok response with status in message", async () => {
      fetchMock.mockReturnValueOnce(failResponse(413));
      await expect(apiUpload([makeFile("big.png")])).rejects.toThrow("Upload failed: 413");
    });

    it("sends empty FormData when given empty file array", async () => {
      fetchMock.mockReturnValueOnce(okJson({ jobId: "j", files: [] }));
      await apiUpload([]);

      const fd = fetchMock.mock.calls[0][1].body as FormData;
      expect(fd.getAll("files")).toHaveLength(0);
    });
  });

  // -- apiDownloadBlob ------------------------------------------------------

  describe("apiDownloadBlob", () => {
    it("returns a Blob from the download URL", async () => {
      setToken("dl-tok");
      const blob = new Blob(["image-data"], { type: "image/png" });
      fetchMock.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(blob),
        }),
      );

      const result = await apiDownloadBlob("job-1", "result.png");

      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/v1/download/job-1/result.png");
      expect(opts.headers.get("Authorization")).toBe("Bearer dl-tok");
      expect(result).toBe(blob);
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockReturnValueOnce(failResponse(404));
      await expect(apiDownloadBlob("job-x", "gone.png")).rejects.toThrow("Download failed: 404");
    });

    it("handles special characters in filename", async () => {
      fetchMock.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob()),
        }),
      );

      await apiDownloadBlob("j1", "my file (1).png");
      const url = fetchMock.mock.calls[0][0];
      // The function does raw string concatenation, so special chars pass through
      expect(url).toBe("/api/v1/download/j1/my file (1).png");
    });
  });

  // -- getDownloadUrl -------------------------------------------------------

  describe("getDownloadUrl", () => {
    it("constructs the correct URL", () => {
      expect(getDownloadUrl("abc", "out.png")).toBe("/api/v1/download/abc/out.png");
    });
  });

  // -- api network error → connection store ---------------------------------

  describe("api network error → connection store", () => {
    it("triggers disconnected state on TypeError from fetch", async () => {
      const { useConnectionStore } = await import("@/stores/connection-store");
      useConnectionStore.setState({
        status: "connected",
        failedSince: null,
        lastHealthCheck: null,
      });

      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await expect(apiGet("/v1/test")).rejects.toThrow("Failed to fetch");

      expect(useConnectionStore.getState().status).toBe("disconnected");
    });

    it("does NOT trigger disconnected on HTTP errors", async () => {
      const { useConnectionStore } = await import("@/stores/connection-store");
      useConnectionStore.setState({
        status: "connected",
        failedSince: null,
        lastHealthCheck: null,
      });

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      );
      await expect(apiGet("/v1/test")).rejects.toThrow();

      expect(useConnectionStore.getState().status).toBe("connected");
    });
  });

  // -- Cross-cutting: token is read fresh on every call --------------------

  describe("token freshness", () => {
    it("reads the token from localStorage on each request, not cached", async () => {
      setToken("first-token");
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/a");
      expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer first-token");

      setToken("second-token");
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/b");
      expect(fetchMock.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer second-token");
    });

    it("omits Authorization header after clearToken", async () => {
      setToken("about-to-die");
      clearToken();
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/c");
      expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBeNull();
    });
  });
});

// ==========================================================================
// useAuth security
// ==========================================================================

describe("useAuth security — network error", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("does NOT grant admin when API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    // Flush the async checkAuth() call
    await act(async () => {});

    // loading stays true — setState was never called
    expect(result.current.loading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.role).toBeNull();
  });
});
