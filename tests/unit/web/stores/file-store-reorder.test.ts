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
  needsServerPreview: vi.fn<(_file: File) => boolean>(() => false),
  fetchDecodedPreview: vi.fn<
    (_file: File) => Promise<{ url: string; originalWidth: number; originalHeight: number } | null>
  >(() => Promise.resolve(null)),
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

function names(): string[] {
  return useFileStore.getState().files.map((f) => f.name);
}

describe("useFileStore reordering", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
    vi.clearAllMocks();
    imagePreviewMock.needsServerPreview.mockReturnValue(false);
    imagePreviewMock.fetchDecodedPreview.mockResolvedValue(null);
  });

  it("gives every entry a stable, unique id", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);
    const ids = useFileStore.getState().entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
  });

  it("reorderFiles moves an entry to a new position", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);

    useFileStore.getState().reorderFiles(0, 2);

    expect(names()).toEqual(["b.png", "c.png", "a.png"]);
  });

  it("reorderFiles preserves each entry's id across the move", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);
    const idA = useFileStore.getState().entries[0].id;

    useFileStore.getState().reorderFiles(0, 2);

    const moved = useFileStore.getState().entries[2];
    expect(moved.file.name).toBe("a.png");
    expect(moved.id).toBe(idA);
  });

  it("reorderFiles keeps the selected entry selected", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);
    useFileStore.getState().setSelectedIndex(1); // select b.png

    useFileStore.getState().reorderFiles(2, 0); // move c.png to front -> [c, a, b]

    expect(names()).toEqual(["c.png", "a.png", "b.png"]);
    expect(useFileStore.getState().selectedIndex).toBe(2); // b.png followed
    expect(useFileStore.getState().selectedFileName).toBe("b.png");
  });

  it("reorderFiles is a no-op for out-of-range indexes", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    const before = useFileStore.getState().entries;

    useFileStore.getState().reorderFiles(0, 5);
    useFileStore.getState().reorderFiles(-1, 0);
    useFileStore.getState().reorderFiles(1, 1);

    expect(useFileStore.getState().entries).toBe(before);
    expect(names()).toEqual(["a.png", "b.png"]);
  });

  it("reverseFiles reverses the order and keeps the selected entry selected", () => {
    useFileStore
      .getState()
      .setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png"), makeFile("d.png")]);
    useFileStore.getState().setSelectedIndex(0); // select a.png

    useFileStore.getState().reverseFiles();

    expect(names()).toEqual(["d.png", "c.png", "b.png", "a.png"]);
    expect(useFileStore.getState().selectedIndex).toBe(3); // a.png followed to the end
    expect(useFileStore.getState().selectedFileName).toBe("a.png");
  });

  it("reverseFiles is a no-op with fewer than two files", () => {
    useFileStore.getState().setFiles([makeFile("only.png")]);
    const before = useFileStore.getState().entries;

    useFileStore.getState().reverseFiles();

    expect(useFileStore.getState().entries).toBe(before);
  });

  it("updateEntryById and markClaimedById follow the entry across reorderFiles and reverseFiles", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png"), makeFile("c.png")]);
    const idA = useFileStore.getState().entries[0].id;

    useFileStore.getState().reorderFiles(0, 2); // [b, c, a]
    useFileStore.getState().updateEntryById(idA, {
      processedUrl: "blob:result-a",
      processedFilename: "a-out.png",
      status: "completed",
    });
    useFileStore.getState().markClaimedById(idA);

    const afterReorder = useFileStore.getState().entries;
    expect(afterReorder[2]).toMatchObject({
      id: idA,
      processedUrl: "blob:result-a",
      processedFilename: "a-out.png",
      status: "completed",
      claimed: true,
    });
    expect(afterReorder[0].processedUrl).toBeNull();
    expect(afterReorder[0].claimed).toBe(false);

    useFileStore.getState().reverseFiles(); // [a, c, b]
    useFileStore.getState().updateEntryById(idA, { processedUrl: "blob:rerun-a" });

    const afterReverse = useFileStore.getState().entries;
    expect(afterReverse[0]).toMatchObject({
      id: idA,
      processedUrl: "blob:rerun-a",
      claimed: false,
    });
    expect(afterReverse[2].processedUrl).toBeNull();
  });

  it("applies decoded HEIC previews to the moved entry after a reorder in setFiles and addFiles", async () => {
    imagePreviewMock.needsServerPreview.mockImplementation((file: File) =>
      file.name.endsWith(".heic"),
    );
    let resolveA:
      | ((v: { url: string; originalWidth: number; originalHeight: number }) => void)
      | undefined;
    let resolveC:
      | ((v: { url: string; originalWidth: number; originalHeight: number }) => void)
      | undefined;
    imagePreviewMock.fetchDecodedPreview.mockImplementation((file: File) => {
      if (file.name === "a.heic") {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return new Promise((resolve) => {
        resolveC = resolve;
      });
    });

    useFileStore
      .getState()
      .setFiles([makeFile("a.heic", 100, "image/heic"), makeFile("b.png", 100, "image/png")]);
    useFileStore.getState().reorderFiles(0, 1); // [b.png, a.heic]

    resolveA?.({ url: "blob:decoded-a", originalWidth: 800, originalHeight: 600 });
    await vi.waitFor(() => {
      expect(useFileStore.getState().entries[1].previewLoading).toBe(false);
    });
    expect(useFileStore.getState().entries[1]).toMatchObject({
      blobUrl: "blob:decoded-a",
      originalWidth: 800,
      originalHeight: 600,
    });

    useFileStore.getState().addFiles([makeFile("c.heic", 100, "image/heic")]); // [b.png, a.heic, c.heic]
    useFileStore.getState().reverseFiles(); // [c.heic, a.heic, b.png]

    resolveC?.({ url: "blob:decoded-c", originalWidth: 1024, originalHeight: 768 });
    await vi.waitFor(() => {
      expect(useFileStore.getState().entries[0].previewLoading).toBe(false);
    });
    expect(useFileStore.getState().entries[0]).toMatchObject({
      blobUrl: "blob:decoded-c",
      originalWidth: 1024,
      originalHeight: 768,
    });
  });
});
