// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// Global mocks
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const storageMap = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, val: string) => storageMap.set(key, val)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() {
    return storageMap.size;
  },
  key: vi.fn((_i: number) => null),
});

import {
  apiDeleteUserFiles,
  apiListFiles,
  apiUploadUserFiles,
  formatHeaders,
  getDownloadUrl,
  getFileDownloadUrl,
  getFileThumbnailUrl,
  parseApiError,
  setToken,
} from "@/lib/api";

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    blob: () => Promise.resolve(new Blob(["bytes"])),
  } as unknown as Response);
}

function failJson(status: number, body: Record<string, unknown>) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

// ==========================================================================
// parseApiError
// ==========================================================================
describe("parseApiError", () => {
  it("returns FeatureNotInstalledError for FEATURE_NOT_INSTALLED code", () => {
    const result = parseApiError(
      {
        code: "FEATURE_NOT_INSTALLED",
        feature: "ai-rembg",
        featureName: "AI Background Remover",
        estimatedSize: "500MB",
      },
      500,
    );
    expect(typeof result).toBe("object");
    if (typeof result === "object") {
      expect(result.type).toBe("feature_not_installed");
      expect(result.feature).toBe("ai-rembg");
      expect(result.featureName).toBe("AI Background Remover");
      expect(result.estimatedSize).toBe("500MB");
    }
  });

  it("returns error string when error field is present", () => {
    const result = parseApiError({ error: "Something broke" }, 500);
    expect(result).toBe("Something broke");
  });

  it("returns message field when error field is missing", () => {
    const result = parseApiError({ message: "Not found" }, 404);
    expect(result).toBe("Not found");
  });

  it("returns fallback message when no error or message", () => {
    const result = parseApiError({}, 422);
    expect(result).toBe("Processing failed: 422");
  });

  it("returns string details appended to error", () => {
    const result = parseApiError({ error: "Validation", details: "field X is required" }, 400);
    expect(result).toBe("Validation: field X is required");
  });

  it("returns array details joined with semicolons", () => {
    const result = parseApiError({ error: "Errors", details: ["field A", "field B"] }, 400);
    expect(result).toBe("Errors: field A; field B");
  });

  it("returns array of objects details with message property", () => {
    const result = parseApiError(
      { error: "Validation", details: [{ message: "too short" }, { message: "too long" }] },
      400,
    );
    expect(result).toBe("Validation: too short; too long");
  });

  it("returns JSON-stringified details for object arrays without message", () => {
    const result = parseApiError({ error: "Err", details: [{ code: 1 }] }, 400);
    expect(result).toContain('{"code":1}');
  });

  it("returns JSON-stringified object details", () => {
    const result = parseApiError({ error: "Err", details: { nested: "value" } }, 400);
    expect(result).toBe('Err: {"nested":"value"}');
  });

  it("returns details only when error is not a string", () => {
    const result = parseApiError({ error: 123, details: "some detail" }, 400);
    expect(result).toBe("some detail");
  });
});

// ==========================================================================
// formatHeaders
// ==========================================================================
describe("formatHeaders", () => {
  beforeEach(() => {
    storageMap.clear();
  });

  it("includes Authorization header when token is set", () => {
    storageMap.set("snapotter-token", "my-token");
    const headers = formatHeaders();
    expect(headers.get("Authorization")).toBe("Bearer my-token");
  });

  it("omits Authorization header when no token", () => {
    const headers = formatHeaders();
    expect(headers.get("Authorization")).toBeNull();
  });

  it("includes analytics consent header when no token and consent is set to true", () => {
    storageMap.set("snapotter-analytics-consent", "true");
    const headers = formatHeaders();
    expect(headers.get("X-Analytics-Consent")).toBe("true");
  });

  it("includes analytics consent header when consent is false", () => {
    storageMap.set("snapotter-analytics-consent", "false");
    const headers = formatHeaders();
    expect(headers.get("X-Analytics-Consent")).toBe("false");
  });

  it("does not include analytics consent header when token exists", () => {
    storageMap.set("snapotter-token", "tok");
    storageMap.set("snapotter-analytics-consent", "true");
    const headers = formatHeaders();
    expect(headers.get("X-Analytics-Consent")).toBeNull();
  });

  it("does not include analytics consent header when consent is not true/false", () => {
    storageMap.set("snapotter-analytics-consent", "remind");
    const headers = formatHeaders();
    expect(headers.get("X-Analytics-Consent")).toBeNull();
  });

  it("merges provided HeadersInit with auth headers", () => {
    storageMap.set("snapotter-token", "tok");
    const headers = formatHeaders({ "Content-Type": "application/json" });
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer tok");
  });
});

// ==========================================================================
// apiListFiles
// ==========================================================================
describe("apiListFiles", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    storageMap.clear();
  });

  it("calls correct URL without params", async () => {
    fetchMock.mockReturnValueOnce(okJson({ files: [], total: 0 }));
    await apiListFiles();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/files");
  });

  it("includes search param when provided", async () => {
    fetchMock.mockReturnValueOnce(okJson({ files: [], total: 0 }));
    await apiListFiles({ search: "sunset" });
    expect(fetchMock.mock.calls[0][0]).toContain("search=sunset");
  });

  it("includes limit param when provided", async () => {
    fetchMock.mockReturnValueOnce(okJson({ files: [], total: 0 }));
    await apiListFiles({ limit: 50 });
    expect(fetchMock.mock.calls[0][0]).toContain("limit=50");
  });

  it("includes offset param when provided", async () => {
    fetchMock.mockReturnValueOnce(okJson({ files: [], total: 0 }));
    await apiListFiles({ offset: 10 });
    expect(fetchMock.mock.calls[0][0]).toContain("offset=10");
  });

  it("includes all params when provided", async () => {
    fetchMock.mockReturnValueOnce(okJson({ files: [], total: 0 }));
    await apiListFiles({ search: "test", limit: 10, offset: 5 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("search=test");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=5");
  });
});

// ==========================================================================
// apiUploadUserFiles
// ==========================================================================
describe("apiUploadUserFiles", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    storageMap.clear();
  });

  it("sends files as FormData to upload endpoint", async () => {
    const file = new File(["content"], "img.png", { type: "image/png" });
    fetchMock.mockReturnValueOnce(
      okJson({ files: [{ id: "1", originalName: "img.png", size: 7, version: 1 }] }),
    );

    const result = await apiUploadUserFiles([file]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/files/upload");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(result.files).toHaveLength(1);
  });

  it("throws on non-ok response", async () => {
    const file = new File(["content"], "img.png", { type: "image/png" });
    fetchMock.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 413, json: () => Promise.reject(new Error("no")) }),
    );
    await expect(apiUploadUserFiles([file])).rejects.toThrow("Upload failed: 413");
  });

  it("triggers disconnected on TypeError", async () => {
    const file = new File(["content"], "img.png", { type: "image/png" });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(apiUploadUserFiles([file])).rejects.toThrow("Failed to fetch");
  });
});

// ==========================================================================
// apiDeleteUserFiles
// ==========================================================================
describe("apiDeleteUserFiles", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    storageMap.clear();
  });

  it("sends DELETE with JSON body of ids", async () => {
    fetchMock.mockReturnValueOnce(okJson({ deleted: 2 }));

    const result = await apiDeleteUserFiles(["id1", "id2"]);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/files");
    expect(opts.method).toBe("DELETE");
    expect(JSON.parse(opts.body)).toEqual({ ids: ["id1", "id2"] });
    expect(result.deleted).toBe(2);
  });

  it("throws on non-ok response", async () => {
    fetchMock.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 403, json: () => Promise.reject(new Error("no")) }),
    );
    await expect(apiDeleteUserFiles(["id1"])).rejects.toThrow("Delete failed: 403");
  });

  it("triggers disconnected on TypeError", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(apiDeleteUserFiles(["id1"])).rejects.toThrow("Failed to fetch");
  });
});

// ==========================================================================
// URL helpers
// ==========================================================================
describe("URL helpers", () => {
  it("getDownloadUrl builds correct URL", () => {
    expect(getDownloadUrl("job-1", "output.png")).toBe("/api/v1/download/job-1/output.png");
  });

  it("getFileThumbnailUrl builds correct URL", () => {
    expect(getFileThumbnailUrl("file-abc")).toBe("/api/v1/files/file-abc/thumbnail");
  });

  it("getFileDownloadUrl builds correct URL", () => {
    expect(getFileDownloadUrl("file-xyz")).toBe("/api/v1/files/file-xyz/download");
  });
});

// ==========================================================================
// throwWithMessage (tested through api methods)
// ==========================================================================
describe("throwWithMessage error extraction", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    storageMap.clear();
  });

  it("extracts error field from response JSON", async () => {
    const { apiGet } = await import("@/lib/api");
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Bad request" }),
      }),
    );
    await expect(apiGet("/v1/test")).rejects.toThrow("Bad request");
  });

  it("extracts message field when error is absent", async () => {
    const { apiGet } = await import("@/lib/api");
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "Not found" }),
      }),
    );
    await expect(apiGet("/v1/test")).rejects.toThrow("Not found");
  });

  it("falls back to status code when JSON parsing fails", async () => {
    const { apiGet } = await import("@/lib/api");
    fetchMock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("not json")),
      }),
    );
    await expect(apiGet("/v1/test")).rejects.toThrow("API error: 502");
  });
});
