// @vitest-environment jsdom
import { de } from "@snapotter/shared/i18n/de.js";
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
      uploading: false,
      uploadProgress: null,
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
    expect(s.uploading).toBe(false);
    expect(s.uploadProgress).toBeNull();
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

  it("setActiveTab switches to upload tab and clears stale error", () => {
    useFilesPageStore.setState({ error: "Failed to load files" });
    useFilesPageStore.getState().setActiveTab("upload");
    expect(useFilesPageStore.getState().activeTab).toBe("upload");
    expect(useFilesPageStore.getState().error).toBeNull();
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

    expect(mockApiUploadUserFiles).toHaveBeenCalledWith([file], expect.any(Function), undefined);
    expect(mockApiListFiles).toHaveBeenCalled();
    expect(useFilesPageStore.getState().activeTab).toBe("recent");
  });

  it("uploadFiles forwards the caller's translations to the upload API (#4083)", async () => {
    const file = new File(["content"], "photo.png", { type: "image/png" });
    mockApiUploadUserFiles.mockResolvedValueOnce({ files: [] });
    mockApiListFiles.mockResolvedValueOnce({ files: [], total: 0 });

    await useFilesPageStore.getState().uploadFiles([file], de);

    expect(mockApiUploadUserFiles).toHaveBeenCalledWith([file], expect.any(Function), de);
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

  it("uploadFiles tracks uploading separately from list-fetch loading and invalidates overlapping fetchFiles (#3310)", async () => {
    const existingFile = {
      id: "existing",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    const staleFetchedFile = {
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
    useFilesPageStore.setState({
      files: [existingFile],
      knownFiles: new Map([["existing", existingFile]]),
      total: 1,
      activeTab: "upload",
    });

    let resolveSlowFetch!: (value: { files: (typeof staleFetchedFile)[]; total: number }) => void;
    mockApiListFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSlowFetch = resolve;
        }),
    );

    const slowFetch = useFilesPageStore.getState().fetchFiles();
    expect(useFilesPageStore.getState().loading).toBe(true);
    expect(useFilesPageStore.getState().uploading).toBe(false);

    let rejectUpload!: (reason?: unknown) => void;
    mockApiUploadUserFiles.mockImplementationOnce(
      (_files: File[], onProgress?: (percent: number) => void) =>
        new Promise((_resolve, reject) => {
          onProgress?.(45);
          rejectUpload = reject;
        }),
    );

    const file = new File(["content"], "too-big.png", { type: "image/png" });
    const uploadPromise = useFilesPageStore.getState().uploadFiles([file]);

    // Starting uploadFiles cancels the slow list fetch's loading indicator and sets uploading: true.
    expect(useFilesPageStore.getState().uploading).toBe(true);
    expect(useFilesPageStore.getState().loading).toBe(false);
    expect(useFilesPageStore.getState().uploadProgress).toBe(45);

    rejectUpload(new Error("Payload Too Large"));
    await uploadPromise;

    expect(useFilesPageStore.getState().error).toBe("Payload Too Large");
    expect(useFilesPageStore.getState().uploading).toBe(false);
    expect(useFilesPageStore.getState().loading).toBe(false);
    expect(useFilesPageStore.getState().uploadProgress).toBeNull();
    expect(useFilesPageStore.getState().activeTab).toBe("upload");

    // Late resolution of the superseded fetchFiles call must not overwrite files, knownFiles, or error.
    resolveSlowFetch({ files: [staleFetchedFile], total: 1 });
    await slowFetch;

    const s = useFilesPageStore.getState();
    expect(s.error).toBe("Payload Too Large");
    expect(s.files).toEqual([existingFile]);
    expect(s.knownFiles).toEqual(new Map([["existing", existingFile]]));
    expect(s.loading).toBe(false);
    expect(s.uploading).toBe(false);
  });

  it("uploadFiles ignores late fetchFiles rejections started before or during the upload (#3310)", async () => {
    const existingFile = {
      id: "existing",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    useFilesPageStore.setState({
      files: [existingFile],
      knownFiles: new Map([["existing", existingFile]]),
      total: 1,
      selectedFileId: "existing",
      checkedIds: new Set(["existing"]),
      activeTab: "upload",
    });

    let rejectSlowFetch!: (reason?: unknown) => void;
    let rejectMidUploadFetch!: (reason?: unknown) => void;
    mockApiListFiles
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSlowFetch = reject;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectMidUploadFetch = reject;
          }),
      );

    const slowFetch = useFilesPageStore.getState().fetchFiles();

    let rejectUpload!: (reason?: unknown) => void;
    mockApiUploadUserFiles.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );

    const file = new File(["content"], "broken.png", { type: "image/png" });
    const uploadPromise = useFilesPageStore.getState().uploadFiles([file]);

    // A fetchFiles started during uploadFiles does not flip loading to true or wipe files when it rejects mid-upload.
    const midUploadFetch = useFilesPageStore.getState().fetchFiles();
    expect(useFilesPageStore.getState().loading).toBe(false);
    rejectMidUploadFetch(new Error("Mid-upload fetch failed"));
    await midUploadFetch;
    expect(useFilesPageStore.getState().files).toEqual([existingFile]);
    expect(useFilesPageStore.getState().error).toBeNull();

    rejectUpload(new Error("Upload 500"));
    await uploadPromise;

    expect(useFilesPageStore.getState().error).toBe("Upload 500");

    // Late rejection from the superseded fetchFiles must not wipe files, knownFiles, or upload error.
    rejectSlowFetch(new Error("List fetch failed"));
    await slowFetch;

    const s = useFilesPageStore.getState();
    expect(s.error).toBe("Upload 500");
    expect(s.files).toEqual([existingFile]);
    expect(s.knownFiles).toEqual(new Map([["existing", existingFile]]));
    expect(s.selectedFileId).toBe("existing");
    expect(s.checkedIds).toEqual(new Set(["existing"]));
    expect(s.loading).toBe(false);
    expect(s.uploading).toBe(false);
  });

  it("deleteChecked invalidates overlapping fetchFiles when starting and when failing (#3310)", async () => {
    const keepFile = {
      id: "keep",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    const deleteFile = {
      id: "del",
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
      files: [keepFile, deleteFile],
      knownFiles: new Map([
        ["keep", keepFile],
        ["del", deleteFile],
      ]),
      total: 2,
      checkedIds: new Set(["del"]),
    });

    let resolveSlowFetch!: (value: { files: (typeof keepFile)[]; total: number }) => void;
    let resolveMidDeleteFetch!: (value: { files: (typeof keepFile)[]; total: number }) => void;
    mockApiListFiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSlowFetch = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMidDeleteFetch = resolve;
          }),
      );

    // 1. A slow fetchFiles starts before deleteChecked.
    const slowFetch = useFilesPageStore.getState().fetchFiles();

    let rejectDelete!: (reason?: unknown) => void;
    mockApiDeleteUserFiles.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectDelete = reject;
        }),
    );

    const deletePromise = useFilesPageStore.getState().deleteChecked();

    // Slow fetch resolving while deleteChecked is in flight must not flip loading to false or overwrite files.
    resolveSlowFetch({ files: [keepFile, deleteFile], total: 2 });
    await slowFetch;
    expect(useFilesPageStore.getState().loading).toBe(true);

    // 2. Another fetchFiles starts while deleteChecked is still in flight, then deleteChecked fails.
    const midDeleteFetch = useFilesPageStore.getState().fetchFiles();

    rejectDelete(new Error("Delete 500"));
    await deletePromise;

    expect(useFilesPageStore.getState().error).toBe("Delete 500");
    expect(useFilesPageStore.getState().loading).toBe(false);

    // The fetchFiles that was in flight when deleteChecked failed is also invalidated so it cannot clear error.
    resolveMidDeleteFetch({ files: [keepFile, deleteFile], total: 2 });
    await midDeleteFetch;

    const s = useFilesPageStore.getState();
    expect(s.error).toBe("Delete 500");
    expect(s.loading).toBe(false);
    expect(s.checkedIds).toEqual(new Set(["del"]));
  });

  it("deleteChecked still prunes deleted files and refreshes when a mid-delete fetchFiles resolves before delete completes (#3310)", async () => {
    const keepFile = {
      id: "keep",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    const deleteFile = {
      id: "del",
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
      files: [keepFile, deleteFile],
      knownFiles: new Map([
        ["keep", keepFile],
        ["del", deleteFile],
      ]),
      total: 2,
      checkedIds: new Set(["del"]),
    });

    let resolveMidDeleteFetch!: (value: { files: (typeof keepFile)[]; total: number }) => void;
    mockApiListFiles
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMidDeleteFetch = resolve;
          }),
      )
      .mockResolvedValueOnce({ files: [keepFile], total: 1 });

    let resolveDelete!: (value: { deleted: number }) => void;
    mockApiDeleteUserFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    const deletePromise = useFilesPageStore.getState().deleteChecked();
    const midDeleteFetch = useFilesPageStore.getState().fetchFiles();

    // Mid-delete fetch resolves with stale pre-delete list while deleteChecked is still in flight.
    resolveMidDeleteFetch({ files: [keepFile, deleteFile], total: 2 });
    await midDeleteFetch;
    expect(useFilesPageStore.getState().loading).toBe(true);

    resolveDelete({ deleted: 1 });
    await deletePromise;

    const s = useFilesPageStore.getState();
    expect(s.files).toEqual([keepFile]);
    expect(s.knownFiles).toEqual(new Map([["keep", keepFile]]));
    expect(s.checkedIds.size).toBe(0);
    expect(s.loading).toBe(false);
    expect(s.error).toBeNull();
  });

  it("uploadFiles retries once on TypeError and keeps uploading true until post-upload fetchFiles completes (#3310)", async () => {
    vi.useFakeTimers();
    try {
      const uploadedFile = {
        id: "uploaded",
        originalName: "otter.png",
        mimeType: "image/png",
        size: 200,
        width: 20,
        height: 20,
        version: 1,
        toolChain: [],
        createdAt: "",
      };
      useFilesPageStore.setState({ activeTab: "upload" });

      mockApiUploadUserFiles
        .mockImplementationOnce(async (_files: File[], onProgress?: (percent: number) => void) => {
          onProgress?.(30);
          throw new TypeError("Network error");
        })
        .mockImplementationOnce(async (_files: File[], onProgress?: (percent: number) => void) => {
          onProgress?.(100);
          return { files: [uploadedFile] };
        });

      let resolvePostUploadFetch!: (value: {
        files: (typeof uploadedFile)[];
        total: number;
      }) => void;
      mockApiListFiles.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePostUploadFetch = resolve;
          }),
      );

      const file = new File(["content"], "otter.png", { type: "image/png" });
      const uploadPromise = useFilesPageStore.getState().uploadFiles([file]);

      await vi.advanceTimersByTimeAsync(0);
      expect(useFilesPageStore.getState().uploading).toBe(true);
      expect(useFilesPageStore.getState().uploadProgress).toBe(0);

      await vi.advanceTimersByTimeAsync(1500);
      // While post-upload fetchFiles is in flight, uploading remains true and activeTab stays upload.
      expect(useFilesPageStore.getState().uploading).toBe(true);
      expect(useFilesPageStore.getState().uploadProgress).toBeNull();
      expect(useFilesPageStore.getState().activeTab).toBe("upload");

      resolvePostUploadFetch({ files: [uploadedFile], total: 1 });
      await uploadPromise;

      const s = useFilesPageStore.getState();
      expect(s.uploading).toBe(false);
      expect(s.loading).toBe(false);
      expect(s.activeTab).toBe("recent");
      expect(s.files).toEqual([uploadedFile]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("overlapping uploadFiles and deleteChecked do not leave uploading or loading stuck (#3310)", async () => {
    const keepFile = {
      id: "keep",
      originalName: "otter.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    const deleteFile = {
      id: "del",
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
      files: [keepFile, deleteFile],
      knownFiles: new Map([
        ["keep", keepFile],
        ["del", deleteFile],
      ]),
      total: 2,
      selectedFileId: "del",
      checkedIds: new Set(["del"]),
      activeTab: "upload",
    });

    let rejectUpload!: (reason?: unknown) => void;
    mockApiUploadUserFiles.mockImplementationOnce(
      (_files: File[], onProgress?: (percent: number) => void) =>
        new Promise((_resolve, reject) => {
          onProgress?.(50);
          rejectUpload = reject;
        }),
    );

    let resolveDelete!: (value: { deleted: number }) => void;
    mockApiDeleteUserFiles.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    mockApiListFiles.mockResolvedValueOnce({ files: [keepFile], total: 1 });

    const file = new File(["content"], "new.png", { type: "image/png" });
    const uploadPromise = useFilesPageStore.getState().uploadFiles([file]);
    const deletePromise = useFilesPageStore.getState().deleteChecked();

    expect(useFilesPageStore.getState().uploading).toBe(true);
    expect(useFilesPageStore.getState().loading).toBe(true);

    resolveDelete({ deleted: 1 });
    await deletePromise;

    expect(useFilesPageStore.getState().files).toEqual([keepFile]);
    expect(useFilesPageStore.getState().checkedIds.size).toBe(0);
    expect(useFilesPageStore.getState().selectedFileId).toBeNull();
    expect(useFilesPageStore.getState().loading).toBe(false);
    expect(useFilesPageStore.getState().uploading).toBe(true);

    rejectUpload(new Error("Upload failed after delete"));
    await uploadPromise;

    const s = useFilesPageStore.getState();
    expect(s.uploading).toBe(false);
    expect(s.loading).toBe(false);
    expect(s.uploadProgress).toBeNull();
    expect(s.error).toBe("Upload failed after delete");
  });

  it("superseded uploadFiles does not overwrite a newer uploadFiles call (#3310)", async () => {
    const uploadedFile = {
      id: "second",
      originalName: "second.png",
      mimeType: "image/png",
      size: 200,
      width: 20,
      height: 20,
      version: 1,
      toolChain: [],
      createdAt: "",
    };
    let rejectFirst!: (reason?: unknown) => void;
    let progressFirst!: (percent: number) => void;
    let resolveSecond!: (value: { files: (typeof uploadedFile)[] }) => void;

    mockApiUploadUserFiles
      .mockImplementationOnce(
        (_files: File[], onProgress?: (percent: number) => void) =>
          new Promise((_resolve, reject) => {
            progressFirst = onProgress ?? (() => {});
            rejectFirst = reject;
          }),
      )
      .mockImplementationOnce(
        (_files: File[], onProgress?: (percent: number) => void) =>
          new Promise((resolve) => {
            onProgress?.(80);
            resolveSecond = resolve;
          }),
      );
    mockApiListFiles.mockResolvedValueOnce({ files: [uploadedFile], total: 1 });

    const firstPromise = useFilesPageStore
      .getState()
      .uploadFiles([new File(["1"], "first.png", { type: "image/png" })]);
    const secondPromise = useFilesPageStore
      .getState()
      .uploadFiles([new File(["2"], "second.png", { type: "image/png" })]);

    // Stale progress and rejection from first upload are ignored while second upload is active.
    progressFirst(25);
    expect(useFilesPageStore.getState().uploadProgress).toBe(80);

    rejectFirst(new Error("First upload failed"));
    await firstPromise;
    expect(useFilesPageStore.getState().uploading).toBe(true);
    expect(useFilesPageStore.getState().error).toBeNull();

    resolveSecond({ files: [uploadedFile] });
    await secondPromise;

    const s = useFilesPageStore.getState();
    expect(s.uploading).toBe(false);
    expect(s.error).toBeNull();
    expect(s.files).toEqual([uploadedFile]);
  });
});
