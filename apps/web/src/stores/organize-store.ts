import { create } from "zustand";

/**
 * Page order for the Organize PDF tool.
 *
 * The thumbnail grid (organize-pdf-canvas) writes the order and the settings
 * panel reads it back to build the qpdf spec it submits, so the two live in a
 * store rather than passing props across the tool-page layout.
 */
interface OrganizeState {
  /** Original 1-based page numbers, in their current output order. */
  pageOrder: number[];
  /** Page count of the loaded document; 0 when nothing is loaded. */
  pageCount: number;

  /** Load a document, resetting the order to its natural 1..count. */
  setDocument: (pageCount: number) => void;
  /** Move the page at `from` to `to`, sliding the pages in between. */
  movePage: (from: number, to: number) => void;
  /** Restore the natural page order of the loaded document. */
  reset: () => void;
  /** Drop the document (file removed, or the tool unmounted). */
  clear: () => void;
}

const naturalOrder = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

export const useOrganizeStore = create<OrganizeState>((set) => ({
  pageOrder: [],
  pageCount: 0,

  setDocument: (pageCount) => set({ pageCount, pageOrder: naturalOrder(pageCount) }),

  movePage: (from, to) =>
    set((state) => {
      const last = state.pageOrder.length - 1;
      if (from === to || from < 0 || to < 0 || from > last || to > last) return state;
      const next = [...state.pageOrder];
      next.splice(to, 0, ...next.splice(from, 1));
      return { pageOrder: next };
    }),

  reset: () => set((state) => ({ pageOrder: naturalOrder(state.pageCount) })),

  clear: () => set({ pageOrder: [], pageCount: 0 }),
}));
