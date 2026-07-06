import { create } from "zustand";
import { apiGet, apiPut } from "@/lib/api";

interface PinnedToolsState {
  /** Tool ids in display order, newest pin first. */
  pinnedTools: string[];
  /** The last array the server confirmed; the rollback target on write failure. */
  lastConfirmed: string[];
  loaded: boolean;
  loadError: boolean;
  fetch: () => Promise<void>;
  pin: (id: string) => void;
  unpin: (id: string) => void;
  isPinned: (id: string) => boolean;
}

// De-duplicate concurrent fetch() calls (mirrors settings-store).
let inFlight: Promise<void> | null = null;

// Serialize writes: each change appends to this chain, so PUTs run strictly in
// order and the network can never reorder them. A write whose array already
// matches lastConfirmed is skipped (coalesces a pin+unpin burst).
let writeQueue: Promise<void> = Promise.resolve();

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function sameArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Test seam: resolves once every queued write has settled. Lets unit tests
 * drain in-flight persistence before resetting the fetch mock between cases,
 * so a write enqueued by one test cannot bleed into the next.
 */
export function flushPinnedWrites(): Promise<void> {
  return writeQueue;
}

export const usePinnedToolsStore = create<PinnedToolsState>((set, get) => {
  function enqueueWrite() {
    writeQueue = writeQueue.then(async () => {
      const snapshot = get().pinnedTools;
      if (sameArray(snapshot, get().lastConfirmed)) return;
      try {
        await apiPut("/v1/preferences", { pinnedTools: snapshot });
        set({ lastConfirmed: snapshot });
      } catch {
        // Persist failed: roll the optimistic change back to the confirmed set.
        set({ pinnedTools: get().lastConfirmed });
      }
    });
  }

  return {
    pinnedTools: [],
    lastConfirmed: [],
    loaded: false,
    loadError: false,

    fetch: async () => {
      if (get().loaded && !get().loadError) return;
      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          const data = await apiGet<{ preferences: Record<string, unknown> }>("/v1/preferences");
          const raw = data.preferences?.pinnedTools;
          const pins = isStringArray(raw) ? raw : [];
          set({ pinnedTools: pins, lastConfirmed: pins, loaded: true, loadError: false });
        } catch {
          set({ loaded: true, loadError: true });
        }
      })();

      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
    },

    pin: (id) => {
      const current = get().pinnedTools;
      if (current.includes(id)) return;
      set({ pinnedTools: [id, ...current] });
      enqueueWrite();
    },

    unpin: (id) => {
      const current = get().pinnedTools;
      if (!current.includes(id)) return;
      set({ pinnedTools: current.filter((x) => x !== id) });
      enqueueWrite();
    },

    isPinned: (id) => get().pinnedTools.includes(id),
  };
});
