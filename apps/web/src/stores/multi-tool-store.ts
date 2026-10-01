import { PDF_MULTI_TOOL_LIMITS } from "@snapotter/shared";
import { create } from "zustand";

/**
 * Editor state for the PDF Multi-Tool: documents loaded into the session plus
 * the output page plan. The canvas (multi-tool-pdf-canvas) writes it and the
 * settings panel (multi-tool-pdf-settings) reads it to build the submission,
 * so the two live in a store rather than passing props across the tool-page
 * layout, the same split as the Organize PDF store.
 *
 * The plan is tied to the File objects it was built from and outlives the
 * canvas unmount (the result view replaces it), so returning to the editor
 * keeps the arrangement. Plan entries and documents carry stable string ids
 * (a module counter), so dnd drag-ids and React keys stay valid while pages are
 * moved, duplicated, or removed.
 */

/** One output page: which loaded document (0-based) and which of its pages. */
export interface PlanPage {
  id: string;
  doc: number;
  page: number;
  rot: 0 | 90 | 180 | 270;
}

export interface LoadedDoc {
  id: string;
  file: File;
  pageCount: number;
  /** Rendered thumbnails, 1-based page -> data URL, filled progressively. */
  thumbs: Record<number, string>;
  /** True when the PDF could not be opened. Individual thumbnail failures are recoverable. */
  failed: boolean;
}

interface MultiToolState {
  /** Documents in load order; doc 0 is the file the tool opened with. */
  docs: LoadedDoc[];
  /** Output page sequence over `docs`; empty until doc 0 finishes loading. */
  plan: PlanPage[];
  /** Index into THUMB_ZOOM_LEVELS; the editor tile-size zoom. */
  zoomIndex: number;

  /** Register doc 0 at its natural 1..count order; keeps an existing plan. */
  setPrimary: (file: File, pageCount: number) => void;
  /** Reconcile the upload list, retaining surviving documents and their plan entries. */
  syncFiles: (files: File[]) => void;
  /**
   * Drop the document with this id and its plan pages, renumbering the rest.
   * Returns the position it held (-1 if unknown) so the caller removes the
   * same upload. Needed because one File can back two documents.
   */
  removeDoc: (id: string) => number;
  /** Fill thumbnail/count state for a doc as renders complete. */
  patchDoc: (
    doc: number,
    patch: Partial<Pick<LoadedDoc, "pageCount" | "thumbs" | "failed">>,
  ) => void;
  /**
   * Append every page of `doc` to the plan, up to the output-page limit.
   * Pages not yet in it are added in document order; pages already in the
   * plan keep their position. Returns the plan length.
   */
  appendDoc: (doc: number) => number;
  /** Append one page after a plan position (-1 appends at the end), unless
   *  the plan is already at the output-page limit. */
  appendPage: (doc: number, page: number, after: number) => void;
  /** Move the entry with one id to the position of another id. */
  movePage: (fromId: string, toId: string) => void;
  /** Take the plan entry with this id out. */
  removePage: (entryId: string) => void;
  /** Rotate the plan entry with this id by `delta` degrees (mod 360). */
  rotatePage: (entryId: string, delta: 90 | -90) => void;
  /** Rebuild the plan as doc 0's natural order (extras join by choice). */
  resetPlan: () => void;
  /** One rung up the THUMB_ZOOM_LEVELS ladder. */
  zoomIn: () => void;
  /** One rung down the THUMB_ZOOM_LEVELS ladder. */
  zoomOut: () => void;
  /** Drop everything (the tool unmounted). */
  clear: () => void;
}

/** Stable unique ids for plan entries and docs. */
let nextId = 0;
const newId = (kind: "d" | "p"): string => {
  nextId += 1;
  return `${kind}${nextId}`;
};

/**
 * Thumbnail zoom ladder for the editor (multipliers over the base tile
 * size). Index-based so −/+ buttons move one rung at a time; index 1 is the
 * 100% default.
 */
export const THUMB_ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2];

/** Doc 0's natural 1..count sequence as the default output plan, capped at
 *  the server's output-page limit. Pages beyond it could never be submitted,
 *  and an uncapped plan would render one drag tile per page (a 10k-page doc
 *  would freeze the editor). */
const doc0Pages = (d: { pageCount: number }): PlanPage[] =>
  Array.from({ length: Math.min(d.pageCount, PDF_MULTI_TOOL_LIMITS.outputPages) }, (_, i) => ({
    id: newId("p"),
    doc: 0,
    page: i + 1,
    rot: 0,
  }));

export const useMultiToolStore = create<MultiToolState>((set, get) => ({
  docs: [],
  plan: [],
  zoomIndex: 1,

  zoomIn: () =>
    set((state) => ({
      zoomIndex: Math.min(state.zoomIndex + 1, THUMB_ZOOM_LEVELS.length - 1),
    })),

  zoomOut: () => set((state) => ({ zoomIndex: Math.max(state.zoomIndex - 1, 0) })),

  setPrimary: (file, pageCount) =>
    set((state) => {
      const doc0 = state.docs[0];
      // Same file re-announced (canvas remount) keeps the arrangement and any
      // thumbnails that already rendered.
      if (!doc0 || doc0.file !== file || doc0.pageCount === pageCount) return state;
      const doc0Next = { ...doc0, pageCount };
      const docs = [doc0Next, ...state.docs.slice(1)];
      // Pages the user explicitly pulled in from other docs outrank doc 0's
      // generated natural plan when the output limit is reached.
      const kept = state.plan.filter((p) => p.doc !== 0);
      const room = Math.max(0, PDF_MULTI_TOOL_LIMITS.outputPages - kept.length);
      return { docs, plan: [...doc0Pages(doc0Next).slice(0, room), ...kept] };
    }),

  syncFiles: (files) =>
    set((state) => {
      if (files.length === state.docs.length && files.every((f, i) => state.docs[i].file === f)) {
        return state;
      }
      // Match occurrences, not just File identity: the same File can occur
      // more than once. Stable doc ids also keep thumbnail streams attached
      // to the right source when a preceding document is removed.
      const positions = new Map<number, number>();
      const docs = files.map((file, index) => {
        const previous = state.docs.findIndex((d, i) => d.file === file && !positions.has(i));
        if (previous >= 0) {
          positions.set(previous, index);
          return state.docs[previous];
        }
        return { id: newId("d"), file, pageCount: 0, thumbs: {}, failed: false };
      });
      const plan = state.plan.flatMap((page) => {
        const doc = positions.get(page.doc);
        return doc === undefined ? [] : [{ ...page, doc }];
      });
      return { docs, plan };
    }),

  removeDoc: (id) => {
    const at = get().docs.findIndex((d) => d.id === id);
    if (at < 0) return -1;
    set((state) => ({
      docs: state.docs.filter((_, i) => i !== at),
      plan: state.plan.flatMap((page) => {
        if (page.doc === at) return [];
        return [page.doc > at ? { ...page, doc: page.doc - 1 } : page];
      }),
    }));
    return at;
  },

  patchDoc: (doc, patch) =>
    set((state) => ({
      // thumbs merge rather than replace: strips patch with whatever pages
      // their stream has flushed so far, and two streams for the same doc
      // (StrictMode dev double-mount) must not un-render each other's pages.
      docs: state.docs.map((d, i) =>
        i === doc
          ? {
              ...d,
              ...patch,
              thumbs: patch.thumbs ? { ...d.thumbs, ...patch.thumbs } : d.thumbs,
            }
          : d,
      ),
    })),

  appendDoc: (doc) => {
    const { docs, plan } = get();
    const source = docs[doc];
    if (!source) return plan.length;
    // Pages already present keep their plan position; missing ones append in
    // document order, so opening a doc twice is idempotent. The plan never
    // grows past the server's output-page limit.
    const room = PDF_MULTI_TOOL_LIMITS.outputPages - plan.length;
    if (room <= 0) return plan.length;
    const present = new Set(plan.filter((p) => p.doc === doc).map((p) => p.page));
    const additions = Array.from({ length: source.pageCount }, (_, i) => i + 1)
      .filter((page) => !present.has(page))
      .slice(0, room)
      .map((page): PlanPage => ({ id: newId("p"), doc, page, rot: 0 }));
    const next = [...plan, ...additions];
    set({ plan: next });
    return next.length;
  },

  appendPage: (doc, page, after) =>
    set((state) => {
      if (state.plan.length >= PDF_MULTI_TOOL_LIMITS.outputPages) return state;
      const plan = [...state.plan];
      const at = after >= 0 && after < plan.length ? after + 1 : plan.length;
      plan.splice(at, 0, { id: newId("p"), doc, page, rot: 0 });
      return { plan };
    }),

  movePage: (fromId, toId) =>
    set((state) => {
      const from = state.plan.findIndex((p) => p.id === fromId);
      const to = state.plan.findIndex((p) => p.id === toId);
      const last = state.plan.length - 1;
      if (from === to || from < 0 || to < 0 || from > last || to > last) return state;
      const plan = [...state.plan];
      plan.splice(to, 0, ...plan.splice(from, 1));
      return { plan };
    }),

  removePage: (entryId) => set((state) => ({ plan: state.plan.filter((p) => p.id !== entryId) })),

  rotatePage: (entryId, delta) =>
    set((state) => ({
      plan: state.plan.map((p) =>
        p.id === entryId
          ? { ...p, rot: ((((p.rot + delta) % 360) + 360) % 360) as PlanPage["rot"] }
          : p,
      ),
    })),

  resetPlan: () =>
    set((state) => {
      const doc0 = state.docs[0];
      return { plan: doc0 && doc0.pageCount > 0 ? doc0Pages(doc0) : state.plan };
    }),

  clear: () => set({ docs: [], plan: [] }),
}));
