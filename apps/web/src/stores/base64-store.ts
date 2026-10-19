import { create } from "zustand";
import { useFileStore } from "@/stores/file-store";
import {
  base64ResultKey,
  claimToolResult,
  isUnclaimed,
  useToolResultClaims,
} from "@/stores/tool-result-claims";

export interface Base64Result {
  /**
   * The file-store entry this was encoded from. Names repeat (every pasted
   * screenshot is "image.png"), so this is what ties a result to its file.
   */
  entryId: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  encodedSize: number;
  overheadPercent: number;
  base64: string;
  dataUri: string;
}

export interface Base64Error {
  /** The file-store entry that failed. See Base64Result.entryId. */
  entryId: string;
  filename: string;
  error: string;
}

export interface Base64Progress {
  completed: number;
  total: number;
  currentFile: string;
}

interface Base64State {
  results: Base64Result[];
  errors: Base64Error[];
  processing: boolean;
  progress: Base64Progress | null;
  expandedIndex: number;

  setResults: (results: Base64Result[], errors: Base64Error[]) => void;
  setProcessing: (v: boolean) => void;
  setProgress: (p: Base64Progress | null) => void;
  addResult: (result: Base64Result) => void;
  addError: (error: Base64Error) => void;
  setExpandedIndex: (i: number) => void;
  reset: () => void;
}

let activeBase64Abort: (() => void) | null = null;
let base64RunId = 0;

export function beginBase64Run(abort: () => void): {
  isCurrent: () => boolean;
  end: () => void;
} {
  activeBase64Abort?.();
  const runId = ++base64RunId;
  activeBase64Abort = abort;
  return {
    isCurrent: () => runId === base64RunId,
    end: () => {
      if (activeBase64Abort === abort) activeBase64Abort = null;
    },
  };
}

export const useBase64Store = create<Base64State>((set) => ({
  results: [],
  errors: [],
  processing: false,
  progress: null,
  expandedIndex: 0,

  setResults: (results, errors) => set({ results, errors, expandedIndex: 0 }),
  setProcessing: (v) => set({ processing: v }),
  setProgress: (p) => set({ progress: p }),
  addResult: (result) => set((s) => ({ results: [...s.results, result] })),
  addError: (error) => set((s) => ({ errors: [...s.errors, error] })),
  setExpandedIndex: (i) => set({ expandedIndex: i }),
  reset: () => {
    base64RunId++;
    const abort = activeBase64Abort;
    activeBase64Abort = null;
    abort?.();
    set({ results: [], errors: [], processing: false, progress: null, expandedIndex: 0 });
  },
}));

useFileStore.subscribe((state, prevState) => {
  if (state.entries === prevState.entries) return;

  const prevIds = new Set(prevState.entries.map((e) => e.id));
  const nextIds = new Set(state.entries.map((e) => e.id));

  if (nextIds.size === prevIds.size && state.entries.every((e) => prevIds.has(e.id))) {
    return;
  }

  if (state.entries.length === 0 || state.entries.some((e) => !prevIds.has(e.id))) {
    const s = useBase64Store.getState();
    if (
      activeBase64Abort !== null ||
      s.processing ||
      s.results.length > 0 ||
      s.errors.length > 0 ||
      s.progress !== null ||
      s.expandedIndex !== 0
    ) {
      s.reset();
    }
    return;
  }

  const { results, errors } = useBase64Store.getState();
  const nextResults = results.filter((r) => nextIds.has(r.entryId));
  const nextErrors = errors.filter((e) => nextIds.has(e.entryId));
  const resultsChanged = nextResults.length !== results.length;
  const errorsChanged = nextErrors.length !== errors.length;
  if (!resultsChanged && !errorsChanged) {
    return;
  }

  const wholeClaimed =
    resultsChanged &&
    nextResults.length > 0 &&
    !isUnclaimed(
      base64ResultKey(results),
      useToolResultClaims.getState().claimed["image-to-base64"],
    );

  useBase64Store.setState({
    ...(resultsChanged ? { results: nextResults } : {}),
    ...(errorsChanged ? { errors: nextErrors } : {}),
  });

  if (wholeClaimed) {
    claimToolResult("image-to-base64", base64ResultKey(nextResults));
  }
});
