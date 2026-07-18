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

import { useFileStore } from "@/stores/file-store";

function makeFile(name: string, size = 1024, type = "image/png"): File {
  const buf = new ArrayBuffer(size);
  return new File([buf], name, { type });
}

describe("useFileStore library save mode (issue #495)", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
    vi.clearAllMocks();
  });

  it("defaults librarySaveMode to non-destructive 'new'", () => {
    expect(useFileStore.getState().librarySaveMode).toBe("new");
  });

  it("setLibrarySaveMode switches the mode", () => {
    useFileStore.getState().setLibrarySaveMode("overwrite");
    expect(useFileStore.getState().librarySaveMode).toBe("overwrite");
  });

  it("reset restores the 'new' default and clears the last saved file id", () => {
    useFileStore.getState().setLibrarySaveMode("overwrite");
    useFileStore.getState().setLastSavedLibraryFileId("lib-1");

    useFileStore.getState().reset();

    expect(useFileStore.getState().librarySaveMode).toBe("new");
    expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
  });

  it("undoProcessing keeps the chosen mode but clears the last saved file id", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setLibrarySaveMode("overwrite");
    useFileStore.getState().setLastSavedLibraryFileId("lib-2");

    useFileStore.getState().undoProcessing();

    expect(useFileStore.getState().librarySaveMode).toBe("overwrite");
    expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
  });

  it("staging a new file set restores the non-destructive default", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setLibrarySaveMode("overwrite");

    // A later library import stages a different file; the overwrite choice
    // made for the previous file must not carry over (#495 review finding).
    useFileStore.getState().setFiles([makeFile("b.png")]);

    expect(useFileStore.getState().librarySaveMode).toBe("new");
  });

  it("tracks the last saved library file id", () => {
    expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
    useFileStore.getState().setLastSavedLibraryFileId("lib-3");
    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("lib-3");
  });
});
