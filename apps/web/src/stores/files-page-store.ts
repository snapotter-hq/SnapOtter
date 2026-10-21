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
  uploading: boolean;
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
let uploadRequestId = 0;
let deleteRequestId = 0;
let uploadInFlight = 0;
let deleteInFlight = 0;

export const useFilesPageStore = create<FilesPageState>((set, get) => ({
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

  fetchFiles: async () => {
    const requestId = ++fetchRequestId;
    if (uploadInFlight === 0 && deleteInFlight === 0) {
      set({ loading: true, error: null });
    }
    try {
      const { searchQuery } = get();
      const result = await apiListFiles({ search: searchQuery || undefined, limit: 200 });
      if (requestId !== fetchRequestId || deleteInFlight > 0) return;
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
      if (requestId !== fetchRequestId || uploadInFlight > 0 || deleteInFlight > 0) return;
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
    ++fetchRequestId;
    const uploadId = ++uploadRequestId;
    ++uploadInFlight;
    set({
      uploading: true,
      loading: deleteInFlight > 0,
      error: null,
      uploadProgress: 0,
    });
    let lastError: Error | null = null;
    let succeeded = false;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await apiUploadUserFiles(files, (percent) => {
            if (uploadId !== uploadRequestId) return;
            set({ uploadProgress: percent });
          });
          succeeded = true;
          break;
        } catch (err) {
          if (uploadId !== uploadRequestId) return;
          lastError = err instanceof Error ? err : new Error("Upload failed");
          if (attempt === 0 && lastError instanceof TypeError) {
            set({ uploadProgress: 0 });
            await new Promise((r) => setTimeout(r, 1500));
            if (uploadId !== uploadRequestId) return;
            continue;
          }
          break;
        }
      }
    } finally {
      --uploadInFlight;
    }
    if (uploadId !== uploadRequestId) return;
    if (succeeded) {
      set({ uploadProgress: null });
      await get().fetchFiles();
      if (uploadId !== uploadRequestId) return;
      set({ uploading: false, uploadProgress: null, activeTab: "recent" });
      return;
    }
    ++fetchRequestId;
    set({
      error: lastError?.message ?? "Upload failed",
      uploading: false,
      loading: deleteInFlight > 0,
      uploadProgress: null,
    });
  },

  deleteChecked: async () => {
    const { checkedIds } = get();
    if (checkedIds.size === 0) return;
    ++fetchRequestId;
    const deleteId = ++deleteRequestId;
    ++deleteInFlight;
    set({ loading: true, error: null });
    const idsToDelete = Array.from(checkedIds);
    try {
      try {
        await apiDeleteUserFiles(idsToDelete);
      } finally {
        --deleteInFlight;
      }
      const deletedSet = new Set(idsToDelete);
      const nextKnownFiles = new Map(get().knownFiles);
      for (const id of deletedSet) {
        nextKnownFiles.delete(id);
      }
      const nextFiles = get().files.filter((f) => !deletedSet.has(f.id));
      const nextCheckedIds = new Set(
        Array.from(get().checkedIds).filter((id) => !deletedSet.has(id)),
      );
      const currentSelected = get().selectedFileId;
      const nextSelectedFileId =
        currentSelected && deletedSet.has(currentSelected) ? null : currentSelected;
      if (deleteId !== deleteRequestId) {
        set({
          files: nextFiles,
          knownFiles: nextKnownFiles,
          checkedIds: nextCheckedIds,
          selectedFileId: nextSelectedFileId,
        });
        return;
      }
      set({
        files: nextFiles,
        knownFiles: nextKnownFiles,
        checkedIds: nextCheckedIds,
        selectedFileId: nextSelectedFileId,
      });
      await get().fetchFiles();
    } catch (err) {
      if (deleteId !== deleteRequestId) return;
      ++fetchRequestId;
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
  setActiveTab: (tab) => set({ activeTab: tab, error: null }),
}));
