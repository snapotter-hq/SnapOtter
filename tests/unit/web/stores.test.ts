// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { useFileStore } from "@/stores/file-store";
import {
  apiGet,
  apiPost,
  apiUpload,
  apiDownloadBlob,
  setToken,
  clearToken,
  getDownloadUrl,
  apiPut,
  apiDelete,
} from "@/lib/api";

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
    json: () => Promise.resolve({ error: "bad" }),
    blob: () => Promise.resolve(new Blob()),
  } as unknown as Response);
}

// ==========================================================================
// FileStore
// ==========================================================================

describe("FileStore", () => {
  beforeEach(() => {
    // Reset the store to initial state before every test.
    // Zustand keeps state across calls, so we manually reset.
    useFileStore.getState().reset();
    vi.clearAllMocks();
    // After reset, createObjectURL/revokeObjectURL calls are from reset itself;
    // clear them so each test starts clean.
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  // -- Initial state -------------------------------------------------------

  it("has correct initial state (everything null/empty/false)", () => {
    const s = useFileStore.getState();
    expect(s.files).toEqual([]);
    expect(s.jobId).toBeNull();
    expect(s.processedUrl).toBeNull();
    expect(s.originalBlobUrl).toBeNull();
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
    expect(s.originalSize).toBeNull();
    expect(s.processedSize).toBeNull();
    expect(s.selectedFileName).toBeNull();
    expect(s.selectedFileSize).toBeNull();
  });

  // -- setFiles -------------------------------------------------------------

  it("setFiles stores files, creates blob URL, sets selectedFileName/Size, clears error", () => {
    // Seed an error first so we can verify it gets cleared
    useFileStore.getState().setError("old error");
    expect(useFileStore.getState().error).toBe("old error");

    const file = makeFile("photo.png", 2048);
    useFileStore.getState().setFiles([file]);

    const s = useFileStore.getState();
    expect(s.files).toHaveLength(1);
    expect(s.files[0]).toBe(file);
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(s.originalBlobUrl).toBe("blob:fake-url");
    expect(s.selectedFileName).toBe("photo.png");
    expect(s.selectedFileSize).toBe(2048);
    expect(s.error).toBeNull(); // error cleared
  });

  it("setFiles revokes the previous blob URL when new files are set", () => {
    createObjectURL
      .mockReturnValueOnce("blob:first-url")
      .mockReturnValueOnce("blob:second-url");

    useFileStore.getState().setFiles([makeFile("a.png")]);
    expect(useFileStore.getState().originalBlobUrl).toBe("blob:first-url");

    useFileStore.getState().setFiles([makeFile("b.png")]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first-url");
    expect(useFileStore.getState().originalBlobUrl).toBe("blob:second-url");
  });

  it("setFiles with empty array does NOT create a blob URL", () => {
    useFileStore.getState().setFiles([]);

    const s = useFileStore.getState();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(s.originalBlobUrl).toBeNull();
    expect(s.selectedFileName).toBeNull();
    expect(s.selectedFileSize).toBeNull();
  });

  it("setFiles with empty array after prior files still revokes old URL", () => {
    createObjectURL.mockReturnValueOnce("blob:old");
    useFileStore.getState().setFiles([makeFile("old.png")]);
    revokeObjectURL.mockClear();

    useFileStore.getState().setFiles([]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old");
  });

  it("setFiles uses the FIRST file for blob URL when given multiple files", () => {
    const f1 = makeFile("first.png", 100);
    const f2 = makeFile("second.png", 200);
    useFileStore.getState().setFiles([f1, f2]);

    // createObjectURL is called exactly once (only for the first file)
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    // Verify the argument was f1 by identity (same reference)
    expect(createObjectURL.mock.calls[0][0]).toBe(f1);
    expect(useFileStore.getState().selectedFileName).toBe("first.png");
    expect(useFileStore.getState().selectedFileSize).toBe(100);
  });

  // -- setJobId -------------------------------------------------------------

  it("setJobId stores the job ID", () => {
    useFileStore.getState().setJobId("job-abc");
    expect(useFileStore.getState().jobId).toBe("job-abc");
  });

  // -- setProcessedUrl ------------------------------------------------------

  it("setProcessedUrl stores a URL", () => {
    useFileStore.getState().setProcessedUrl("blob:processed");
    expect(useFileStore.getState().processedUrl).toBe("blob:processed");
  });

  it("setProcessedUrl can clear URL with null", () => {
    useFileStore.getState().setProcessedUrl("blob:x");
    useFileStore.getState().setProcessedUrl(null);
    expect(useFileStore.getState().processedUrl).toBeNull();
  });

  // -- setProcessing --------------------------------------------------------

  it("setProcessing sets the processing flag", () => {
    useFileStore.getState().setProcessing(true);
    expect(useFileStore.getState().processing).toBe(true);
    useFileStore.getState().setProcessing(false);
    expect(useFileStore.getState().processing).toBe(false);
  });

  // -- setError -------------------------------------------------------------

  it("setError sets error AND forces processing to false", () => {
    useFileStore.getState().setProcessing(true);
    expect(useFileStore.getState().processing).toBe(true);

    useFileStore.getState().setError("something broke");
    const s = useFileStore.getState();
    expect(s.error).toBe("something broke");
    expect(s.processing).toBe(false); // critical side-effect
  });

  it("setError(null) clears error but still forces processing to false", () => {
    useFileStore.getState().setProcessing(true);
    useFileStore.getState().setError(null);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
  });

  // -- setSizes -------------------------------------------------------------

  it("setSizes sets both originalSize and processedSize", () => {
    useFileStore.getState().setSizes(5000, 2500);
    const s = useFileStore.getState();
    expect(s.originalSize).toBe(5000);
    expect(s.processedSize).toBe(2500);
  });

  it("setSizes with zero values stores zeros (not null)", () => {
    useFileStore.getState().setSizes(0, 0);
    expect(useFileStore.getState().originalSize).toBe(0);
    expect(useFileStore.getState().processedSize).toBe(0);
  });

  // -- undoProcessing -------------------------------------------------------

  it("undoProcessing clears processedUrl, jobId, processedSize, error but KEEPS files and originalBlobUrl", () => {
    createObjectURL.mockReturnValueOnce("blob:orig");

    // Set up full state
    const file = makeFile("keep-me.png", 3000);
    useFileStore.getState().setFiles([file]);
    useFileStore.getState().setJobId("job-1");
    useFileStore.getState().setProcessedUrl("blob:result");
    useFileStore.getState().setSizes(3000, 1500);
    useFileStore.getState().setError("transient error");

    useFileStore.getState().undoProcessing();

    const s = useFileStore.getState();
    // Cleared
    expect(s.processedUrl).toBeNull();
    expect(s.jobId).toBeNull();
    expect(s.processedSize).toBeNull();
    expect(s.error).toBeNull();
    // Preserved
    expect(s.files).toHaveLength(1);
    expect(s.files[0]).toBe(file);
    expect(s.originalBlobUrl).toBe("blob:orig");
    expect(s.selectedFileName).toBe("keep-me.png");
    expect(s.selectedFileSize).toBe(3000);
    // originalSize is NOT cleared by undoProcessing (only processedSize is)
    expect(s.originalSize).toBe(3000);
  });

  it("undoProcessing does NOT revoke the originalBlobUrl", () => {
    createObjectURL.mockReturnValueOnce("blob:keep-alive");
    useFileStore.getState().setFiles([makeFile("x.png")]);
    revokeObjectURL.mockClear();

    useFileStore.getState().undoProcessing();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  // -- reset ----------------------------------------------------------------

  it("reset clears everything and revokes the blob URL", () => {
    createObjectURL.mockReturnValueOnce("blob:to-revoke");
    useFileStore.getState().setFiles([makeFile("doomed.png")]);
    useFileStore.getState().setJobId("job-x");
    useFileStore.getState().setProcessedUrl("blob:proc");
    useFileStore.getState().setProcessing(true);
    useFileStore.getState().setError("oops");
    useFileStore.getState().setSizes(100, 50);
    revokeObjectURL.mockClear();

    useFileStore.getState().reset();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:to-revoke");

    const s = useFileStore.getState();
    expect(s.files).toEqual([]);
    expect(s.jobId).toBeNull();
    expect(s.processedUrl).toBeNull();
    expect(s.originalBlobUrl).toBeNull();
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
    expect(s.originalSize).toBeNull();
    expect(s.processedSize).toBeNull();
    expect(s.selectedFileName).toBeNull();
    expect(s.selectedFileSize).toBeNull();
  });

  it("reset when originalBlobUrl is already null does NOT call revokeObjectURL", () => {
    // Start from a clean state (no files set)
    revokeObjectURL.mockClear();
    useFileStore.getState().reset();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  // -- State transition sequences -------------------------------------------

  it("setFiles -> setProcessing(true) -> setError -> processing is false", () => {
    useFileStore.getState().setFiles([makeFile("t.png")]);
    useFileStore.getState().setProcessing(true);
    expect(useFileStore.getState().processing).toBe(true);

    useFileStore.getState().setError("fail");
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe("fail");
  });

  it("setFiles -> setProcessing(true) -> setProcessedUrl -> setProcessing(false) (happy path)", () => {
    useFileStore.getState().setFiles([makeFile("t.png")]);
    useFileStore.getState().setProcessing(true);
    expect(useFileStore.getState().processing).toBe(true);

    useFileStore.getState().setProcessedUrl("blob:done");
    // processedUrl does NOT auto-clear processing
    expect(useFileStore.getState().processing).toBe(true);

    useFileStore.getState().setProcessing(false);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().processedUrl).toBe("blob:done");
  });

  it("rapid setFiles calls only keep the latest state and revoke each prior URL", () => {
    createObjectURL
      .mockReturnValueOnce("blob:1")
      .mockReturnValueOnce("blob:2")
      .mockReturnValueOnce("blob:3");

    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setFiles([makeFile("b.png")]);
    useFileStore.getState().setFiles([makeFile("c.png")]);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:2");
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(useFileStore.getState().originalBlobUrl).toBe("blob:3");
    expect(useFileStore.getState().selectedFileName).toBe("c.png");
  });

  it("setError during processing, then undoProcessing, then retry cycle works", () => {
    useFileStore.getState().setFiles([makeFile("retry.png")]);
    useFileStore.getState().setProcessing(true);
    useFileStore.getState().setError("timeout");
    expect(useFileStore.getState().processing).toBe(false);

    useFileStore.getState().undoProcessing();
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().files).toHaveLength(1);

    // Retry
    useFileStore.getState().setProcessing(true);
    expect(useFileStore.getState().processing).toBe(true);
    useFileStore.getState().setProcessedUrl("blob:retry-ok");
    useFileStore.getState().setProcessing(false);
    expect(useFileStore.getState().processedUrl).toBe("blob:retry-ok");
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
    it("setToken stores in localStorage under 'stirling-token'", () => {
      setToken("my-secret");
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "stirling-token",
        "my-secret",
      );
      expect(storageMap.get("stirling-token")).toBe("my-secret");
    });

    it("clearToken removes 'stirling-token' from localStorage", () => {
      setToken("to-remove");
      clearToken();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "stirling-token",
      );
      expect(storageMap.has("stirling-token")).toBe(false);
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

      expect(fetchMock).toHaveBeenCalledWith("/api/v1/health", {
        headers: { Authorization: "Bearer tok-123" },
      });
      expect(result).toEqual({ data: "ok" });
    });

    it("sends empty Bearer when no token is set", async () => {
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/anything");

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1].headers.Authorization).toBe("Bearer ");
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
      expect(opts.headers["Content-Type"]).toBe("application/json");
      expect(opts.headers.Authorization).toBe("Bearer post-tok");
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
      expect(opts.headers["Content-Type"]).toBe("application/json");
      expect(opts.headers.Authorization).toBe("Bearer put-tok");
      expect(opts.body).toBe(JSON.stringify({ name: "updated" }));
      expect(result).toEqual({ updated: true });
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockReturnValueOnce(failResponse(404));
      await expect(apiPut("/v1/items/999", {})).rejects.toThrow(
        "API error: 404",
      );
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
      expect(opts.headers.Authorization).toBe("Bearer del-tok");
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
      expect(opts.headers.Authorization).toBe("Bearer up-tok");
      // Body should be FormData
      expect(opts.body).toBeInstanceOf(FormData);
      const fd = opts.body as FormData;
      expect(fd.getAll("files")).toHaveLength(1);
      expect(result).toEqual(payload);
    });

    it("appends multiple files to FormData under the same 'files' key", async () => {
      fetchMock.mockReturnValueOnce(
        okJson({ jobId: "j2", files: [{}, {}] }),
      );

      await apiUpload([makeFile("a.png"), makeFile("b.jpg")]);

      const fd = fetchMock.mock.calls[0][1].body as FormData;
      expect(fd.getAll("files")).toHaveLength(2);
    });

    it("does NOT set Content-Type (browser sets multipart boundary)", async () => {
      fetchMock.mockReturnValueOnce(okJson({ jobId: "j", files: [] }));
      await apiUpload([makeFile("x.png")]);

      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers["Content-Type"]).toBeUndefined();
    });

    it("throws on non-ok response with status in message", async () => {
      fetchMock.mockReturnValueOnce(failResponse(413));
      await expect(apiUpload([makeFile("big.png")])).rejects.toThrow(
        "Upload failed: 413",
      );
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
      expect(opts.headers.Authorization).toBe("Bearer dl-tok");
      expect(result).toBe(blob);
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockReturnValueOnce(failResponse(404));
      await expect(apiDownloadBlob("job-x", "gone.png")).rejects.toThrow(
        "Download failed: 404",
      );
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
      expect(getDownloadUrl("abc", "out.png")).toBe(
        "/api/v1/download/abc/out.png",
      );
    });
  });

  // -- Cross-cutting: token is read fresh on every call --------------------

  describe("token freshness", () => {
    it("reads the token from localStorage on each request, not cached", async () => {
      setToken("first-token");
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/a");
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer first-token",
      );

      setToken("second-token");
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/b");
      expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(
        "Bearer second-token",
      );
    });

    it("uses empty Bearer immediately after clearToken", async () => {
      setToken("about-to-die");
      clearToken();
      fetchMock.mockReturnValueOnce(okJson({}));
      await apiGet("/v1/c");
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
        "Bearer ",
      );
    });
  });
});
