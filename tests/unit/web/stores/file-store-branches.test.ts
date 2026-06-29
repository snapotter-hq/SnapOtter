// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn((_obj: Blob | MediaSource) => "blob:fake-url");

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL,
  revokeObjectURL,
});

const imagePreviewMock = vi.hoisted(() => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/image-preview", () => imagePreviewMock);

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

import { previewKindFor, useFileStore } from "@/stores/file-store";

function makeFile(name: string, size = 1024, type = "image/png"): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type });
}

describe("useFileStore branch coverage", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
    vi.clearAllMocks();
    imagePreviewMock.needsServerPreview.mockReturnValue(false);
    imagePreviewMock.fetchDecodedPreview.mockResolvedValue(null);
    let urlCounter = 0;
    createObjectURL.mockImplementation((_obj: Blob | MediaSource) => `blob:url-${++urlCounter}`);
  });

  it("maps unknown modalities to no preview", () => {
    expect(previewKindFor("unknown" as never)).toBe("none");
  });

  it("removeFile is a no-op for missing indexes", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const before = useFileStore.getState().entries;
    revokeObjectURL.mockClear();

    useFileStore.getState().removeFile(3);

    expect(useFileStore.getState().entries).toBe(before);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("removeFile revokes processed preview URLs", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: "blob:processed",
      processedPreviewUrl: "blob:processed-preview",
    });
    revokeObjectURL.mockClear();

    useFileStore.getState().removeFile(0);

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:processed");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:processed-preview");
  });

  it("setError stops processing only when an error is present", () => {
    useFileStore.getState().setProcessing(true);
    useFileStore.getState().setError(null);
    expect(useFileStore.getState()).toMatchObject({ error: null, processing: true });

    useFileStore.getState().setError("failed");
    expect(useFileStore.getState()).toMatchObject({ error: "failed", processing: false });
  });

  it("setProcessedUrl and setSizes are no-ops without a selected entry", () => {
    expect(() => useFileStore.getState().setProcessedUrl("blob:result")).not.toThrow();
    expect(() => useFileStore.getState().setSizes(1, 2)).not.toThrow();
    expect(useFileStore.getState().entries).toEqual([]);
    expect(useFileStore.getState().processedUrl).toBeNull();
    expect(useFileStore.getState().processedSize).toBeNull();
  });

  it("stores processed preview URLs on the selected entry", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);

    useFileStore.getState().setProcessedUrl("blob:result", "blob:preview");

    expect(useFileStore.getState().entries[0]).toMatchObject({
      processedUrl: "blob:result",
      processedPreviewUrl: "blob:preview",
      processedFilename: null,
      status: "completed",
    });
    expect(useFileStore.getState().processedPreviewUrl).toBe("blob:preview");
  });

  it("applies decoded previews only when the entry still contains the same file", async () => {
    imagePreviewMock.needsServerPreview.mockReturnValue(true);
    imagePreviewMock.fetchDecodedPreview.mockImplementation((file: File) =>
      Promise.resolve(
        file.name === "a.heic"
          ? { url: "blob:decoded-a", originalWidth: 640, originalHeight: 480 }
          : { url: "blob:decoded-b", originalWidth: 320, originalHeight: 240 },
      ),
    );

    const firstFile = makeFile("a.heic", 100, "image/heic");
    const replacementFile = makeFile("b.heic", 100, "image/heic");
    useFileStore.getState().setFiles([firstFile]);
    useFileStore.getState().setFiles([replacementFile]);

    await vi.waitFor(() => {
      expect(useFileStore.getState().entries[0].blobUrl).toBe("blob:decoded-b");
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      file: replacementFile,
      originalWidth: 320,
      originalHeight: 240,
      previewLoading: false,
    });
    expect(useFileStore.getState().entries[0].blobUrl).not.toBe("blob:decoded-a");
  });

  it("clears previewLoading when decoded preview returns null", async () => {
    imagePreviewMock.needsServerPreview.mockReturnValue(true);
    imagePreviewMock.fetchDecodedPreview.mockResolvedValue(null);

    useFileStore.getState().setFiles([makeFile("a.heic", 100, "image/heic")]);

    await vi.waitFor(() => {
      expect(useFileStore.getState().entries[0].previewLoading).toBe(false);
    });
    expect(useFileStore.getState().entries[0].blobUrl).toBe("blob:url-1");
  });
});
