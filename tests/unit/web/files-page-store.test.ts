// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bypass zustand persist middleware
vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    persist: (config: unknown) => config,
  };
});

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

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
);

// Mock the api module
vi.mock("@/lib/api", () => ({
  apiListFiles: vi.fn(),
  apiUploadUserFiles: vi.fn(),
  apiDeleteUserFiles: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  formatHeaders: vi.fn(() => new Headers()),
}));

import { apiDeleteUserFiles, apiListFiles, apiUploadUserFiles } from "@/lib/api";
import { useFilesPageStore } from "@/stores/files-page-store";

const mockApiListFiles = vi.mocked(apiListFiles);
const mockApiUploadUserFiles = vi.mocked(apiUploadUserFiles);
const mockApiDeleteUserFiles = vi.mocked(apiDeleteUserFiles);

// ==========================================================================
// FilesPageStore
// ==========================================================================
describe("useFilesPageStore", () => {
  beforeEach(() => {
    mockApiListFiles.mockReset();
    mockApiUploadUserFiles.mockReset();
    mockApiDeleteUserFiles.mockReset();
    useFilesPageStore.setState({
      files: [],
      knownFiles: new Map(),
      total: 0,
      selectedFileId: null,
      checkedIds: new Set(),
      activeTab: "recent",
      searchQuery: "",
      loading: false,
      error: null,
    });
  });

  // -- Initial state -------------------------------------------------------

  it("has correct initial state", () => {
    const s = useFilesPageStore.getState();
    expect(s.files).toEqual([]);
    expect(s.knownFiles.size).toBe(0);
    expect(s.total).toBe(0);
    expect(s.selectedFileId).toBeNull();
    expect(s.checkedIds.size).toBe(0);
    expect(s.activeTab).toBe("recent");
    expect(s.searchQuery).toBe("");
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  // -- selectFile -----------------------------------------------------------

  it("selectFile sets selected file ID", () => {
    useFilesPageStore.getState().selectFile("file-1");
    expect(useFilesPageStore.getState().selectedFileId).toBe("file-1");
  });

  it("selectFile with null clears selection", () => {
    useFilesPageStore.getState().selectFile("file-1");
    useFilesPageStore.getState().selectFile(null);
    expect(useFilesPageStore.getState().selectedFileId).toBeNull();
  });

  // -- setSearchQuery -------------------------------------------------------

  it("setSearchQuery updates search query", () => {
    useFilesPageStore.getState().setSearchQuery("vacation");
    expect(useFilesPageStore.getState().searchQuery).toBe("vacation");
  });

  // -- setActiveTab ---------------------------------------------------------

  it("setActiveTab switches to upload tab", () => {
    useFilesPageStore.getState().setActiveTab("upload");
    expect(useFilesPageStore.getState().activeTab).toBe("upload");
  });

  it("setActiveTab switches to recent tab", () => {
    useFilesPageStore.getState().setActiveTab("upload");
    useFilesPageStore.getState().setActiveTab("recent");
    expect(useFilesPageStore.getState().activeTab).toBe("recent");
  });

  // -- toggleChecked --------------------------------------------------------

  it("toggleChecked adds an ID to the checked set", () => {
    useFilesPageStore.getState().toggleChecked("file-1");
    expect(useFilesPageStore.getState().checkedIds.has("file-1")).toBe(true);
  });

  it("toggleChecked removes an already-checked ID", () => {
    useFilesPageStore.getState().toggleChecked("file-1");
    useFilesPageStore.getState().toggleChecked("file-1");
    expect(useFilesPageStore.getState().checkedIds.has("file-1")).toBe(false);
  });

  it("toggleChecked handles multiple IDs", () => {
    useFilesPageStore.getState().toggleChecked("file-1");
    useFilesPageStore.getState().toggleChecked("file-2");
    expect(useFilesPageStore.getState().checkedIds.size).toBe(2);
    expect(useFilesPageStore.getState().checkedIds.has("file-1")).toBe(true);
    expect(useFilesPageStore.getState().checkedIds.has("file-2")).toBe(true);
  });

  // -- toggleCheckAll -------------------------------------------------------

  it("toggleCheckAll selects all files when none are selected", () => {
    const files = [
      {
        id: "f1",
        originalName: "a.png",
        mimeType: "image/png",
        size: 100,
        width: 10,
        height: 10,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
      {
        id: "f2",
        originalName: "b.png",
        mimeType: "image/png",
        size: 200,
        width: 20,
        height: 20,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
    ];
    useFilesPageStore.setState({ files });
    useFilesPageStore.getState().toggleCheckAll();
    const checked = useFilesPageStore.getState().checkedIds;
    expect(checked.size).toBe(2);
    expect(checked.has("f1")).toBe(true);
    expect(checked.has("f2")).toBe(true);
  });

  it("toggleCheckAll deselects all when all are already selected", () => {
    const files = [
      {
        id: "f1",
        originalName: "a.png",
        mimeType: "image/png",
        size: 100,
        width: 10,
        height: 10,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
      {
        id: "f2",
        originalName: "b.png",
        mimeType: "image/png",
        size: 200,
        width: 20,
        height: 20,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
    ];
    useFilesPageStore.setState({ files, checkedIds: new Set(["f1", "f2"]) });
    useFilesPageStore.getState().toggleCheckAll();
    expect(useFilesPageStore.getState().checkedIds.size).toBe(0);
  });

  it("toggleCheckAll selects all when only some are checked", () => {
    const files = [
      {
        id: "f1",
        originalName: "a.png",
        mimeType: "image/png",
        size: 100,
        width: 10,
        height: 10,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
      {
        id: "f2",
        originalName: "b.png",
        mimeType: "image/png",
        size: 200,
        width: 20,
        height: 20,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
      {
        id: "f3",
        originalName: "c.png",
        mimeType: "image/png",
        size: 300,
        width: 30,
        height: 30,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
    ];
    useFilesPageStore.setState({ files, checkedIds: new Set(["f1"]) });
    useFilesPageStore.getState().toggleCheckAll();
    expect(useFilesPageStore.getState().checkedIds.size).toBe(3);
  });

  it("toggleCheckAll ticks visible files and preserves hidden ticks when sizes happen to match", () => {
    const visible = [
      {
        id: "f2",
        originalName: "otter.png",
        mimeType: "image/png",
        size: 200,
        width: 20,
        height: 20,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
    ];
    useFilesPageStore.setState({ files: visible, checkedIds: new Set(["f1"]) });

    useFilesPageStore.getState().toggleCheckAll();
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["f1", "f2"]));

    useFilesPageStore.getState().toggleCheckAll();
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["f1"]));
  });

  it("toggleCheckAll completes partial visible selection while preserving hidden ticks", () => {
    const visible = [
      {
        id: "f2",
        originalName: "otter.png",
        mimeType: "image/png",
        size: 200,
        width: 20,
        height: 20,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
      {
        id: "f3",
        originalName: "seal.png",
        mimeType: "image/png",
        size: 300,
        width: 30,
        height: 30,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
    ];
    // checkedIds.size (2) === visible.length (2), with one hidden and one visible ticked.
    useFilesPageStore.setState({ files: visible, checkedIds: new Set(["f1", "f2"]) });

    useFilesPageStore.getState().toggleCheckAll();
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["f1", "f2", "f3"]));

    useFilesPageStore.getState().toggleCheckAll();
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["f1"]));
  });

  it("toggleCheckAll is a no-op when the visible file list is empty", () => {
    useFilesPageStore.setState({ files: [], checkedIds: new Set(["f1", "f2"]) });

    useFilesPageStore.getState().toggleCheckAll();
    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["f1", "f2"]));
  });

  // -- fetchFiles -----------------------------------------------------------

  it("fetchFiles loads files from API", async () => {
    const files = [
      {
        id: "f1",
        originalName: "a.png",
        mimeType: "image/png",
        size: 100,
        width: 10,
        height: 10,
        version: 1,
        toolChain: [],
        createdAt: "",
      },
    ];
    mockApiListFiles.mockResolvedValueOnce({ files, total: 1 });

    await useFilesPageStore.getState().fetchFiles();

    const s = useFilesPageStore.getState();
    expect(s.files).toEqual(files);
    expect(s.total).toBe(1);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("fetchFiles passes searchQuery to API", async () => {
    useFilesPageStore.getState().setSearchQuery("sunset");
    mockApiListFiles.mockResolvedValueOnce({ files: [], total: 0 });

    await useFilesPageStore.getState().fetchFiles();

    expect(mockApiListFiles).toHaveBeenCalledWith({ search: "sunset", limit: 200 });
  });

  it("fetchFiles passes undefined search when searchQuery is empty", async () => {
    mockApiListFiles.mockResolvedValueOnce({ files: [], total: 0 });

    await useFilesPageStore.getState().fetchFiles();

    expect(mockApiListFiles).toHaveBeenCalledWith({ search: undefined, limit: 200 });
  });

  it("fetchFiles sets error and clears stale files and checkedIds on API failure", async () => {
    const staleFile = {
      id: "f1",
      originalName: "beaver.png",
      mimeType: "image/png",
      size: 100,
      width: 10,
      height: 10,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    useFilesPageStore.setState({
      files: [staleFile],
      knownFiles: new Map([["f1", staleFile]]),
      total: 1,
      selectedFileId: "f1",
      checkedIds: new Set(["f1"]),
    });
    mockApiListFiles.mockRejectedValueOnce(new Error("Network error"));

    await useFilesPageStore.getState().fetchFiles();

    const s = useFilesPageStore.getState();
    expect(s.error).toBe("Network error");
    expect(s.loading).toBe(false);
    expect(s.files).toEqual([]);
    expect(s.knownFiles.size).toBe(0);
    expect(s.total).toBe(0);
    expect(s.selectedFileId).toBeNull();
    expect(s.checkedIds.size).toBe(0);
  });

  it("fetchFiles retains seen files in knownFiles across searches and deleteChecked prunes them (#2904)", async () => {
    const beaver = {
      id: "beaver",
      originalName: "beaver.png",
      mimeType: "image/png",
      size: 100,
      width: 10,
      height: 10,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    const otter = {
      id: "otter",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };

    mockApiListFiles.mockResolvedValueOnce({ files: [beaver, otter], total: 2 });
    await useFilesPageStore.getState().fetchFiles();
    expect(useFilesPageStore.getState().knownFiles).toEqual(
      new Map([
        ["beaver", beaver],
        ["otter", otter],
      ]),
    );

    useFilesPageStore.getState().setSearchQuery("otter");
    mockApiListFiles.mockResolvedValueOnce({ files: [otter], total: 1 });
    await useFilesPageStore.getState().fetchFiles();
    expect(useFilesPageStore.getState().files).toEqual([otter]);
    expect(useFilesPageStore.getState().knownFiles).toEqual(
      new Map([
        ["beaver", beaver],
        ["otter", otter],
      ]),
    );

    useFilesPageStore.setState({ checkedIds: new Set(["beaver"]) });
    mockApiDeleteUserFiles.mockResolvedValueOnce({ deleted: 1 });
    mockApiListFiles.mockResolvedValueOnce({ files: [otter], total: 1 });
    await useFilesPageStore.getState().deleteChecked();
    expect(useFilesPageStore.getState().knownFiles).toEqual(new Map([["otter", otter]]));

    // Deleting a currently visible file also prunes it from knownFiles without fetchFiles re-adding it from prevFiles.
    useFilesPageStore.setState({ checkedIds: new Set(["otter"]) });
    mockApiDeleteUserFiles.mockResolvedValueOnce({ deleted: 1 });
    mockApiListFiles.mockResolvedValueOnce({ files: [], total: 0 });
    await useFilesPageStore.getState().deleteChecked();
    expect(useFilesPageStore.getState().knownFiles.size).toBe(0);
  });

  it("fetchFiles sets generic error for non-Error throws", async () => {
    mockApiListFiles.mockRejectedValueOnce("string error");

    await useFilesPageStore.getState().fetchFiles();

    expect(useFilesPageStore.getState().error).toBe("Failed to load files");
  });

  it("fetchFiles sets loading true during request", async () => {
    let loadingDuringCall = false;
    mockApiListFiles.mockImplementation(async () => {
      loadingDuringCall = useFilesPageStore.getState().loading;
      return { files: [], total: 0 };
    });

    await useFilesPageStore.getState().fetchFiles();
    expect(loadingDuringCall).toBe(true);
  });

  it("fetchFiles ignores out-of-order responses from superseded requests (#2905)", async () => {
    const initialFile = {
      id: "initial",
      originalName: "seal.png",
      mimeType: "image/png",
      size: 50,
      width: 5,
      height: 5,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    const staleFile = {
      id: "stale",
      originalName: "beaver.png",
      mimeType: "image/png",
      size: 100,
      width: 10,
      height: 10,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    const freshFile = {
      id: "fresh",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };

    useFilesPageStore.setState({ files: [initialFile], total: 1 });

    let resolveFirst!: (value: { files: (typeof staleFile)[]; total: number }) => void;
    let resolveSecond!: (value: { files: (typeof freshFile)[]; total: number }) => void;
    mockApiListFiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    useFilesPageStore.getState().setSearchQuery("beaver");
    const firstFetch = useFilesPageStore.getState().fetchFiles();

    useFilesPageStore.getState().setSearchQuery("otter");
    const secondFetch = useFilesPageStore.getState().fetchFiles();

    resolveSecond({ files: [freshFile], total: 1 });
    await secondFetch;

    expect(useFilesPageStore.getState().files).toEqual([freshFile]);
    expect(useFilesPageStore.getState().knownFiles).toEqual(
      new Map([
        ["initial", initialFile],
        ["fresh", freshFile],
      ]),
    );
    expect(useFilesPageStore.getState().total).toBe(1);
    expect(useFilesPageStore.getState().loading).toBe(false);

    resolveFirst({ files: [staleFile], total: 1 });
    await firstFetch;

    const s = useFilesPageStore.getState();
    expect(s.files).toEqual([freshFile]);
    expect(s.knownFiles).toEqual(
      new Map([
        ["initial", initialFile],
        ["fresh", freshFile],
      ]),
    );
    expect(s.total).toBe(1);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("fetchFiles ignores late rejections from superseded requests without wiping newer results (#2905)", async () => {
    const freshFile = {
      id: "fresh",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };

    let rejectFirst!: (reason?: unknown) => void;
    mockApiListFiles
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce({ files: [freshFile], total: 1 });

    useFilesPageStore.getState().setSearchQuery("beaver");
    const firstFetch = useFilesPageStore.getState().fetchFiles();

    useFilesPageStore.getState().setSearchQuery("otter");
    await useFilesPageStore.getState().fetchFiles();
    useFilesPageStore.setState({
      selectedFileId: "fresh",
      checkedIds: new Set(["fresh"]),
    });

    rejectFirst(new Error("Stale search failed"));
    await firstFetch;

    const s = useFilesPageStore.getState();
    expect(s.files).toEqual([freshFile]);
    expect(s.knownFiles).toEqual(new Map([["fresh", freshFile]]));
    expect(s.total).toBe(1);
    expect(s.selectedFileId).toBe("fresh");
    expect(s.checkedIds).toEqual(new Set(["fresh"]));
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("fetchFiles keeps loading true when an earlier request settles before the latest request (#2905)", async () => {
    const freshFile = {
      id: "fresh",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };

    let resolveFirst!: (value: { files: (typeof freshFile)[]; total: number }) => void;
    let resolveSecond!: (value: { files: (typeof freshFile)[]; total: number }) => void;
    mockApiListFiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );

    const firstFetch = useFilesPageStore.getState().fetchFiles();
    const secondFetch = useFilesPageStore.getState().fetchFiles();

    resolveFirst({ files: [], total: 0 });
    await firstFetch;
    expect(useFilesPageStore.getState().loading).toBe(true);

    resolveSecond({ files: [freshFile], total: 1 });
    await secondFetch;
    expect(useFilesPageStore.getState().loading).toBe(false);
    expect(useFilesPageStore.getState().files).toEqual([freshFile]);
  });

  // -- uploadFiles ----------------------------------------------------------

  it("uploadFiles calls API then refreshes files", async () => {
    const file = new File(["content"], "photo.png", { type: "image/png" });
    mockApiUploadUserFiles.mockResolvedValueOnce({ files: [] });
    mockApiListFiles.mockResolvedValueOnce({ files: [], total: 0 });

    await useFilesPageStore.getState().uploadFiles([file]);

    expect(mockApiUploadUserFiles).toHaveBeenCalledWith([file], expect.any(Function));
    expect(mockApiListFiles).toHaveBeenCalled();
    expect(useFilesPageStore.getState().activeTab).toBe("recent");
  });

  it("uploadFiles sets error on failure", async () => {
    const file = new File(["content"], "photo.png", { type: "image/png" });
    mockApiUploadUserFiles.mockRejectedValueOnce(new Error("Too large"));

    await useFilesPageStore.getState().uploadFiles([file]);

    expect(useFilesPageStore.getState().error).toBe("Too large");
    expect(useFilesPageStore.getState().loading).toBe(false);
  });

  it("uploadFiles sets generic error for non-Error throws", async () => {
    const file = new File(["content"], "photo.png", { type: "image/png" });
    mockApiUploadUserFiles.mockRejectedValueOnce(42);

    await useFilesPageStore.getState().uploadFiles([file]);

    expect(useFilesPageStore.getState().error).toBe("Upload failed");
  });

  // -- deleteChecked --------------------------------------------------------

  it("deleteChecked calls API with checked IDs and refreshes", async () => {
    useFilesPageStore.setState({ checkedIds: new Set(["f1", "f2"]) });
    mockApiDeleteUserFiles.mockResolvedValueOnce({ deleted: 2 });
    mockApiListFiles.mockResolvedValueOnce({ files: [], total: 0 });

    await useFilesPageStore.getState().deleteChecked();

    expect(mockApiDeleteUserFiles).toHaveBeenCalledWith(expect.arrayContaining(["f1", "f2"]));
    expect(useFilesPageStore.getState().checkedIds.size).toBe(0);
    expect(useFilesPageStore.getState().selectedFileId).toBeNull();
  });

  it("deleteChecked is a no-op when no IDs are checked", async () => {
    await useFilesPageStore.getState().deleteChecked();

    expect(mockApiDeleteUserFiles).not.toHaveBeenCalled();
    expect(useFilesPageStore.getState().loading).toBe(false);
  });

  it("deleteChecked sets error on failure", async () => {
    useFilesPageStore.setState({ checkedIds: new Set(["f1"]) });
    mockApiDeleteUserFiles.mockRejectedValueOnce(new Error("Permission denied"));

    await useFilesPageStore.getState().deleteChecked();

    expect(useFilesPageStore.getState().error).toBe("Permission denied");
    expect(useFilesPageStore.getState().loading).toBe(false);
  });

  it("deleteChecked sets generic error for non-Error throws", async () => {
    useFilesPageStore.setState({ checkedIds: new Set(["f1"]) });
    mockApiDeleteUserFiles.mockRejectedValueOnce("boom");

    await useFilesPageStore.getState().deleteChecked();

    expect(useFilesPageStore.getState().error).toBe("Delete failed");
  });
});
