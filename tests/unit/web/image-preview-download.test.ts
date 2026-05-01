// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn((_obj: Blob | MediaSource) => "blob:preview-url");

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL,
  revokeObjectURL,
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() {
    return 0;
  },
  key: vi.fn(() => null),
});

// ==========================================================================
// fetchDecodedPreview & revokePreviewUrl (image-preview.ts)
// ==========================================================================

import { fetchDecodedPreview, revokePreviewUrl } from "@/lib/image-preview";

describe("fetchDecodedPreview", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    createObjectURL.mockClear();
  });

  it("sends POST to /api/v1/preview with the file as FormData", async () => {
    const blob = new Blob(["image-data"], { type: "image/png" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(blob),
    });

    const file = new File(["heic-data"], "photo.heic", { type: "image/heic" });
    const result = await fetchDecodedPreview(file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/preview");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBeInstanceOf(FormData);

    const formData = opts.body as FormData;
    expect(formData.get("file")).toBe(file);

    expect(result).toBe("blob:preview-url");
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it("returns null when response is not ok", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const file = new File(["data"], "photo.heic", { type: "image/heic" });
    const result = await fetchDecodedPreview(file);

    expect(result).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("returns null when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network error"));

    const file = new File(["data"], "photo.heic", { type: "image/heic" });
    const result = await fetchDecodedPreview(file);

    expect(result).toBeNull();
  });
});

describe("revokePreviewUrl", () => {
  beforeEach(() => {
    revokeObjectURL.mockClear();
  });

  it("calls URL.revokeObjectURL with the given URL", () => {
    revokePreviewUrl("blob:some-preview-url");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:some-preview-url");
  });

  it("calls URL.revokeObjectURL for any string", () => {
    revokePreviewUrl("blob:another-url");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:another-url");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

// ==========================================================================
// triggerDownload (download.ts)
// ==========================================================================

import { triggerDownload } from "@/lib/download";

describe("triggerDownload", () => {
  beforeEach(() => {
    // Remove any leftover anchor tags from body
    for (const a of document.body.querySelectorAll("a")) {
      a.remove();
    }
  });

  it("creates an anchor element, clicks it, and removes it", () => {
    const clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        vi.spyOn(el, "click").mockImplementation(clickSpy);
      }
      return el;
    });

    triggerDownload("blob:download-url", "output.png");

    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The anchor should have been removed from the document after click
    expect(document.body.querySelectorAll("a")).toHaveLength(0);

    vi.restoreAllMocks();
  });

  it("sets the href and download attributes on the anchor", () => {
    let capturedHref = "";
    let capturedDownload = "";
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        vi.spyOn(el, "click").mockImplementation(() => {
          capturedHref = el.getAttribute("href") ?? "";
          capturedDownload = el.getAttribute("download") ?? "";
        });
      }
      return el;
    });

    triggerDownload("blob:file-url", "result.webp");

    expect(capturedHref).toBe("blob:file-url");
    expect(capturedDownload).toBe("result.webp");

    vi.restoreAllMocks();
  });
});
