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
});
