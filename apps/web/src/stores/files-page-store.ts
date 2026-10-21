import { create } from "zustand";
import { apiDeleteUserFiles, apiListFiles, apiUploadUserFiles, type UserFile } from "@/lib/api";

interface FilesPageState {
  files: UserFile[];
  knownFiles: Map<string, UserFile>;
  total: number;
  selectedFileId: string | null;
  checkedIds: Set<string>;
  activeTab: "recent" | "upload";
  searchQuery: string;
  loading: boolean;
  uploadProgress: number | null;
  error: string | null;

  fetchFiles: () => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteChecked: () => Promise<void>;
  selectFile: (id: string | null) => void;
  toggleChecked: (id: string) => void;
  toggleCheckAll: () => void;
  setSearchQuery: (q: string) => void;
  setActiveTab: (tab: "recent" | "upload") => void;
}

let fetchRequestId = 0;

export const useFilesPageStore = create<FilesPageState>((set, get) => ({
  files: [],
  knownFiles: new Map(),
  total: 0,
  selectedFileId: null,
  checkedIds: new Set(),
  activeTab: "recent",
  searchQuery: "",
  loading: false,
  uploadProgress: null,
  error: null,

  fetchFiles: async () => {
    const requestId = ++fetchRequestId;
    set({ loading: true, error: null });
    try {
      const { searchQuery } = get();
      const result = await apiListFiles({ search: searchQuery || undefined, limit: 200 });
      if (requestId !== fetchRequestId) return;
      const { files: prevFiles, knownFiles: prevKnownFiles } = get();
      const nextKnownFiles = new Map(prevKnownFiles);
      for (const f of prevFiles) {
        nextKnownFiles.set(f.id, f);
      }
      for (const f of result.files) {
        nextKnownFiles.set(f.id, f);
      }
      set({
        files: result.files,
        knownFiles: nextKnownFiles,
        total: result.total,
        loading: false,
      });
    } catch (err) {
      if (requestId !== fetchRequestId) return;
      set({
        files: [],
        knownFiles: new Map(),
        total: 0,
        selectedFileId: null,
        checkedIds: new Set(),
        error: err instanceof Error ? err.message : "Failed to load files",
        loading: false,
      });
    }
  },

  uploadFiles: async (files) => {
    set({ loading: true, error: null, uploadProgress: 0 });
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await apiUploadUserFiles(files, (percent) => {
          set({ uploadProgress: percent });
        });
        set({ uploadProgress: null });
        await get().fetchFiles();
        set({ activeTab: "recent" });
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("Upload failed");
        if (attempt === 0 && lastError instanceof TypeError) {
          set({ uploadProgress: 0 });
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        break;
      }
    }
    set({
      error: lastError?.message ?? "Upload failed",
      loading: false,
      uploadProgress: null,
    });
  },

  deleteChecked: async () => {
    const { checkedIds } = get();
    if (checkedIds.size === 0) return;
    set({ loading: true, error: null });
    try {
      const idsToDelete = Array.from(checkedIds);
      await apiDeleteUserFiles(idsToDelete);
      const nextKnownFiles = new Map(get().knownFiles);
      for (const id of idsToDelete) {
        nextKnownFiles.delete(id);
      }
      const nextFiles = get().files.filter((f) => !checkedIds.has(f.id));
      set({
        files: nextFiles,
        knownFiles: nextKnownFiles,
        checkedIds: new Set(),
        selectedFileId: null,
      });
      await get().fetchFiles();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Delete failed", loading: false });
    }
  },

  selectFile: (id) => set({ selectedFileId: id }),
  toggleChecked: (id) => {
    const { checkedIds } = get();
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    set({ checkedIds: next });
  },
  toggleCheckAll: () => {
    const { files, checkedIds } = get();
    if (files.length === 0) return;
    const next = new Set(checkedIds);
    if (files.every((f) => checkedIds.has(f.id))) {
      for (const f of files) next.delete(f.id);
    } else {
      for (const f of files) next.add(f.id);
    }
    set({ checkedIds: next });
  },
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
