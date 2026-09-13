// @vitest-environment jsdom
import { SECTIONS, TOOLS, toolSection } from "@snapotter/shared";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

// Bypass the persist middleware so the editor store starts clean per test.
vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

import { OWN_STORE_TOOL_IDS, useWorkInFlight } from "@/hooks/use-work-in-flight";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useEditorStore } from "@/stores/editor-store";
import { useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { useMemeStore } from "@/stores/meme-store";
import { usePassportPhotoStore } from "@/stores/passport-photo-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useSplitStore } from "@/stores/split-store";
import {
  base64ResultKey,
  claimToolResult,
  collageResultKey,
  duplicateResultKey,
  htmlToImageResultKey,
  memeResultKey,
  passportPhotoResultKey,
  pdfToImageResultKey,
  splitResultKey,
  useToolResultClaims,
} from "@/stores/tool-result-claims";

const TOOL_ROUTE = "/image/compress-image";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

/** Render the hook as if the user were sitting on `path`. */
function workAt(path: string) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  return renderHook(() => useWorkInFlight(), { wrapper }).result.current;
}

/** Load one file and land a result on it, leaving the result unclaimed. */
function seedResult(name = "a.png", processedFilename = "a-compressed.png"): void {
  useFileStore.getState().setFiles([makeFile(name)]);
  useFileStore.getState().updateEntry(0, {
    processedUrl: "blob:result",
    processedFilename,
    status: "completed",
  });
}

/** Every store the guard reads besides the file store, so a test can wipe them all. */
const OWN_STORES: Array<{ getState: () => { reset: () => void } }> = [
  useBase64Store,
  useCollageStore,
  useDuplicateStore,
  useHtmlToImageStore,
  useMemeStore,
  usePdfToImageStore,
  useSplitStore,
];

interface OwnStoreCase {
  toolId: string;
  /** Put the store in the state it holds while the run is in flight. */
  busy: () => void;
  /**
   * Take whatever result is on the page, the way the tool's download control
   * does. Reads the store at call time and goes through the same key function
   * the hook reads, which is the pairing the fix rests on.
   */
  claim: () => void;
  /**
   * Each distinct shape of result this tool can leave sitting on the page.
   * `again` lands a second, different result of that same shape: the claim from
   * the first must not cover it.
   */
  results: Array<{ what: string; seed: () => void; again: () => void }>;
}

/**
 * The seven tools that keep their results in their own store. Seeds go through
 * setState rather than the store actions, because most of those actions fire
 * the real fetch that produced the state in the first place.
 */
const OWN_STORE_CASES: OwnStoreCase[] = [
  {
    toolId: "split",
    busy: () => useSplitStore.setState({ processing: true }),
    claim: () => {
      const { tiles, zipBlobUrl } = useSplitStore.getState();
      claimToolResult("split", splitResultKey(tiles, zipBlobUrl));
    },
    results: [
      {
        what: "tiles are on screen",
        seed: () =>
          useSplitStore.setState({
            tiles: [{ row: 0, col: 0, label: "1", width: 10, height: 10, blobUrl: "blob:tile" }],
          }),
        again: () =>
          useSplitStore.setState({
            tiles: [{ row: 1, col: 1, label: "2", width: 10, height: 10, blobUrl: "blob:tile-2" }],
          }),
      },
      {
        what: "only the zip landed",
        seed: () => useSplitStore.setState({ zipBlobUrl: "blob:tiles.zip" }),
        again: () => useSplitStore.setState({ zipBlobUrl: "blob:tiles-rerun.zip" }),
      },
    ],
  },
  {
    toolId: "pdf-to-image",
    busy: () => usePdfToImageStore.setState({ processing: true }),
    claim: () => {
      const { results, zipUrl } = usePdfToImageStore.getState();
      claimToolResult("pdf-to-image", pdfToImageResultKey(results, zipUrl));
    },
    results: [
      {
        what: "pages are on screen",
        seed: () =>
          usePdfToImageStore.setState({
            results: [{ page: 1, downloadUrl: "/api/v1/download/page-1.png", size: 1024 }],
          }),
        again: () =>
          usePdfToImageStore.setState({
            results: [{ page: 1, downloadUrl: "/api/v1/download/rerun/page-1.png", size: 2048 }],
          }),
      },
      {
        what: "only the zip landed",
        seed: () => usePdfToImageStore.setState({ zipUrl: "/api/v1/download/pages.zip" }),
        again: () => usePdfToImageStore.setState({ zipUrl: "/api/v1/download/rerun/pages.zip" }),
      },
    ],
  },
  {
    toolId: "collage",
    busy: () => useCollageStore.setState({ phase: "processing" }),
    claim: () => claimToolResult("collage", collageResultKey(useCollageStore.getState().resultUrl)),
    results: [
      {
        what: "the collage is on screen",
        seed: () => useCollageStore.setState({ phase: "result", resultUrl: "blob:collage" }),
        again: () => useCollageStore.setState({ phase: "result", resultUrl: "blob:collage-2" }),
      },
    ],
  },
  {
    toolId: "meme-generator",
    busy: () => useMemeStore.setState({ generating: true }),
    claim: () =>
      claimToolResult("meme-generator", memeResultKey(useMemeStore.getState().resultUrl)),
    results: [
      {
        what: "the meme is on screen",
        seed: () =>
          useMemeStore.setState({ phase: "result", resultUrl: "/api/v1/download/meme.png" }),
        again: () =>
          useMemeStore.setState({ phase: "result", resultUrl: "/api/v1/download/meme-2.png" }),
      },
    ],
  },
  {
    toolId: "html-to-image",
    busy: () => useHtmlToImageStore.setState({ capturing: true }),
    claim: () =>
      claimToolResult(
        "html-to-image",
        htmlToImageResultKey(useHtmlToImageStore.getState().resultUrl),
      ),
    results: [
      {
        what: "the capture is on screen",
        seed: () => useHtmlToImageStore.setState({ resultUrl: "/api/v1/download/capture.png" }),
        again: () => useHtmlToImageStore.setState({ resultUrl: "/api/v1/download/capture-2.png" }),
      },
    ],
  },
  {
    toolId: "image-to-base64",
    busy: () => useBase64Store.setState({ processing: true }),
    claim: () =>
      claimToolResult("image-to-base64", base64ResultKey(useBase64Store.getState().results)),
    results: [
      {
        what: "encoded text is on screen",
        seed: () =>
          useBase64Store.setState({
            results: [
              {
                filename: "a.png",
                mimeType: "image/png",
                width: 1,
                height: 1,
                originalSize: 10,
                encodedSize: 14,
                overheadPercent: 40,
                base64: "aGk=",
                dataUri: "data:image/png;base64,aGk=",
              },
            ],
          }),
        // Same file re-encoded: identical text, a new run. Only the array the
        // run built tells the two apart.
        again: () =>
          useBase64Store.setState({
            results: [
              {
                filename: "a.png",
                mimeType: "image/png",
                width: 1,
                height: 1,
                originalSize: 10,
                encodedSize: 14,
                overheadPercent: 40,
                base64: "aGk=",
                dataUri: "data:image/png;base64,aGk=",
              },
            ],
          }),
      },
    ],
  },
  {
    toolId: "passport-photo",
    busy: () => usePassportPhotoStore.setState({ generating: true }),
    claim: () =>
      claimToolResult(
        "passport-photo",
        passportPhotoResultKey(usePassportPhotoStore.getState().generateResult),
      ),
    results: [
      {
        what: "the generated photo is on screen",
        seed: () =>
          usePassportPhotoStore.setState({
            generateResult: {
              downloadUrl: "/api/v1/download/passport.jpg",
              dimensions: { width: 600, height: 600 },
              spec: { country: "US", document: "passport" },
            },
          }),
        // generate writes under the jobId the upload was analyzed as, so a
        // regenerated photo comes back at the SAME url. Nudging the crop or
        // switching country is a new photo all the same.
        again: () =>
          usePassportPhotoStore.setState({
            generateResult: {
              downloadUrl: "/api/v1/download/passport.jpg",
              dimensions: { width: 600, height: 600 },
              spec: { country: "US", document: "visa" },
            },
          }),
      },
    ],
  },
  {
    toolId: "find-duplicates",
    busy: () => useDuplicateStore.setState({ scanning: true }),
    claim: () =>
      claimToolResult("find-duplicates", duplicateResultKey(useDuplicateStore.getState().results)),
    results: [
      {
        what: "the report is on screen",
        seed: () =>
          useDuplicateStore.setState({
            results: {
              totalImages: 2,
              uniqueImages: 1,
              spaceSaveable: 1024,
              duplicateGroups: [],
            },
          }),
        // The same folder rescanned: identical numbers, a new scan.
        again: () =>
          useDuplicateStore.setState({
            results: {
              totalImages: 2,
              uniqueImages: 1,
              spaceSaveable: 1024,
              duplicateGroups: [],
            },
          }),
      },
    ],
  },
];

/** One tile, for the claim-keeping tests below. */
const SEED_TILE = { row: 0, col: 0, label: "1", width: 10, height: 10, blobUrl: "blob:tile" };

/** The route the app really serves this tool at, section included. */
function routeFor(toolId: string): string {
  const tool = TOOLS.find((t) => t.id === toolId);
  if (!tool) throw new Error(`No tool "${toolId}" in the shared catalog`);
  return `/${toolSection(tool)}/${tool.id}`;
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  useFileStore.getState().reset();
  useEditorStore.setState({ isDirty: false });
  useToolResultClaims.getState().reset();
  for (const store of OWN_STORES) store.getState().reset();
  // No reset action on this one: the panel drives it field by field.
  usePassportPhotoStore.setState({
    analyzing: false,
    generating: false,
    analyzeResult: null,
    generateResult: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nothing to lose", () => {
  it("reports nothing on an empty tool page", () => {
    expect(workAt(TOOL_ROUTE)).toBeNull();
  });

  it("reports nothing when files are loaded but nothing has run", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);

    expect(workAt(TOOL_ROUTE)).toBeNull();
  });
});

describe("a run in flight", () => {
  it("reports processing on a tool route", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessing(true);

    expect(workAt(TOOL_ROUTE)).toEqual({ kind: "processing" });
  });

  it("reports processing on the automate page", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessing(true);

    expect(workAt("/automate")).toEqual({ kind: "processing" });
  });

  it("prefers processing over a result still on screen", () => {
    seedResult();
    useFileStore.getState().setProcessing(true);

    expect(workAt(TOOL_ROUTE)).toEqual({ kind: "processing" });
  });

  // Pins the processing check ahead of the zip branch too, not just ahead of
  // the entry branch. Without this, moving it between the two stays green.
  it("prefers processing over a batch zip still on screen", () => {
    seedResult();
    useFileStore.getState().setBatchZip(new Blob(["z"]), "batch.zip");
    useFileStore.getState().setProcessing(true);

    expect(workAt(TOOL_ROUTE)).toEqual({ kind: "processing" });
  });
});

describe("an untaken result", () => {
  it("offers the result for download", () => {
    seedResult();

    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "a-compressed.png" }],
    });
  });

  it("falls back to the source filename when the result has none", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result", status: "completed" });

    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "a.png" }],
    });
  });

  it("reports nothing once the result has been taken", () => {
    seedResult();
    useFileStore.getState().markClaimed(0);

    expect(workAt(TOOL_ROUTE)).toBeNull();
  });

  it("lists only the results that are still untaken", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore
      .getState()
      .updateEntry(0, { processedUrl: "blob:one", processedFilename: "one.png" });
    useFileStore
      .getState()
      .updateEntry(1, { processedUrl: "blob:two", processedFilename: "two.png" });
    useFileStore.getState().markClaimed(0);

    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 1, url: "blob:two", filename: "two.png" }],
    });
  });

  it("keys on the result, not on the status", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    // A tool that lands a result without ever setting status to "completed"
    // must still be guarded: silence is the failure that costs the user.
    useFileStore
      .getState()
      .updateEntry(0, { processedUrl: "blob:result", processedFilename: "out.png" });

    expect(useFileStore.getState().entries[0].status).not.toBe("completed");
    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "out.png" }],
    });
  });
});

describe("a batch zip", () => {
  it("is offered instead of the individual results", () => {
    seedResult();
    const zip = new Blob(["z"]);
    useFileStore.getState().setBatchZip(zip, "batch-compress-image.zip");

    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "zip", blob: zip, filename: "batch-compress-image.zip" }],
    });
  });

  it("reports nothing once the zip has been taken", () => {
    seedResult();
    useFileStore.getState().setBatchZip(new Blob(["z"]), "batch.zip");
    useFileStore.getState().markBatchClaimed();

    expect(workAt(TOOL_ROUTE)).toBeNull();
  });

  // The hook does not screen out a stale zip; setFiles clears it at the source.
  // Nothing inside the hook is under test here, so do not go looking for a
  // guard: this pins the store behaviour the hook leans on.
  it("is gone with the file set that produced it, so nothing is reported", () => {
    seedResult();
    useFileStore.getState().setBatchZip(new Blob(["z"]), "batch.zip");
    useFileStore.getState().setFiles([makeFile("fresh.png")]);

    expect(useFileStore.getState().batchZipBlob).toBeNull();
    expect(workAt(TOOL_ROUTE)).toBeNull();
  });

  // settleFromZip stores the zip first and fills in per-entry results after, so
  // a run that fails that second half (a fileResults mismatch, or unzipSync
  // throwing) leaves a real downloadable zip with no entry results behind it.
  // The guard must still offer it; silence here loses the whole batch.
  it("is offered when the run never landed per-entry results", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const zip = new Blob(["zipbytes"]);
    useFileStore.getState().setBatchZip(zip, "batch-compress-image.zip");
    useFileStore.getState().updateEntry(0, {
      processedUrl: null,
      status: "failed",
      error: "File not found in batch results",
    });

    expect(useFileStore.getState().entries.some((e) => e.processedUrl)).toBe(false);
    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "zip", blob: zip, filename: "batch-compress-image.zip" }],
    });
  });

  // Zip branch skipped because the zip is claimed, entry branch runs because a
  // re-run landed a fresh result. No setState needed: patching processedUrl
  // unclaims the entry, which is the store invariant markBatchClaimed relies on.
  it("gives way to a newer result once the zip has been taken", () => {
    seedResult();
    useFileStore.getState().setBatchZip(new Blob(["z"]), "batch.zip");
    useFileStore.getState().markBatchClaimed();
    useFileStore
      .getState()
      .updateEntry(0, { processedUrl: "blob:rerun", processedFilename: "rerun.png" });

    expect(useFileStore.getState().batchZipClaimed).toBe(true);
    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:rerun", filename: "rerun.png" }],
    });
  });

  it("falls back to a generic filename when the zip has none", () => {
    const zip = new Blob(["zipbytes"]);
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.setState({ batchZipBlob: zip, batchZipFilename: null, batchZipClaimed: false });

    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "zip", blob: zip, filename: "processed-files.zip" }],
    });
  });
});

describe("route scoping", () => {
  it("stays quiet on the file library, which does not own the file store", () => {
    seedResult();

    expect(workAt("/files")).toBeNull();
  });

  it("stays quiet on the dashboard", () => {
    seedResult();

    expect(workAt("/")).toBeNull();
  });

  it("stays quiet on a section index page", () => {
    seedResult();

    expect(workAt("/image")).toBeNull();
  });

  it("stays quiet on a two-segment path whose first part is not a section", () => {
    seedResult();

    expect(workAt("/settings/general")).toBeNull();
  });

  it("guards the automate page through a trailing slash", () => {
    seedResult();

    expect(workAt("/automate/")).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "a-compressed.png" }],
    });
  });

  // Not a normalizePath test: ownsFileStore's split/filter drops the empty last
  // segment on its own, so this stays green with normalizePath deleted. It pins
  // the segment counting, which a switch to a plain split() would break.
  it("counts segments on a tool route whose trailing slash is empty", () => {
    seedResult();

    expect(workAt(`${TOOL_ROUTE}/`)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "a-compressed.png" }],
    });
  });

  // React Router matches case-insensitively unless a route sets caseSensitive,
  // and none do, so an uppercase URL renders the real page and has to be guarded.
  it("guards a tool route reached through an uppercase url", () => {
    seedResult();

    expect(workAt("/IMAGE/Compress-Image")).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "a-compressed.png" }],
    });
  });

  it("guards the automate page reached through an uppercase url", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessing(true);

    expect(workAt("/Automate")).toEqual({ kind: "processing" });
  });

  // Derived from SECTIONS, not a hardcoded list, so a new section has to be
  // guarded rather than silently going untested.
  it("guards every tool section", () => {
    seedResult();

    for (const section of SECTIONS.map((s) => s.id)) {
      expect(workAt(`/${section}/some-tool`)).toEqual({
        kind: "unsaved",
        downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "a-compressed.png" }],
      });
    }
  });
});

describe("the editor", () => {
  it("reports a dirty canvas on the editor route", () => {
    useEditorStore.setState({ isDirty: true });

    expect(workAt("/editor")).toEqual({ kind: "editor-dirty" });
  });

  it("reports a dirty canvas through a trailing slash", () => {
    useEditorStore.setState({ isDirty: true });

    expect(workAt("/editor/")).toEqual({ kind: "editor-dirty" });
  });

  it("reports a dirty canvas through an uppercase url", () => {
    useEditorStore.setState({ isDirty: true });

    expect(workAt("/Editor")).toEqual({ kind: "editor-dirty" });
  });

  it("reports nothing on a clean canvas", () => {
    expect(workAt("/editor")).toBeNull();
  });

  it("does not leak a dirty canvas onto a tool route", () => {
    useEditorStore.setState({ isDirty: true });

    expect(workAt(TOOL_ROUTE)).toBeNull();
  });
});

describe("tools that keep their results outside the file store", () => {
  // Keeps the table honest: an id added to the hook without a case here fails
  // rather than quietly going untested.
  it("has a case for every id the hook covers", () => {
    expect(OWN_STORE_CASES.map((c) => c.toolId).sort()).toEqual([...OWN_STORE_TOOL_IDS].sort());
  });

  for (const toolCase of OWN_STORE_CASES) {
    describe(toolCase.toolId, () => {
      it("reports processing while the run is in flight", () => {
        toolCase.busy();

        expect(workAt(routeFor(toolCase.toolId))).toEqual({ kind: "processing" });
      });

      for (const result of toolCase.results) {
        // No downloads: the guard warns, it does not offer to save these. An
        // empty array is what makes the dialog render Stay and Leave only.
        it(`warns with nothing to download when ${result.what}`, () => {
          result.seed();

          expect(workAt(routeFor(toolCase.toolId))).toEqual({ kind: "unsaved", downloads: [] });
        });

        // The bug (#1123): downloading a split zip and then navigating still
        // raised the dialog, because nothing these tools do reaches the file
        // store's claim.
        it(`goes quiet once the user takes it, ${result.what}`, () => {
          result.seed();
          toolCase.claim();

          expect(workAt(routeFor(toolCase.toolId))).toBeNull();
        });

        // Why the claim records WHICH result was taken rather than a flag: the
        // next run invalidates it without any store remembering to clear
        // anything. A plain boolean passes the test above and fails this one.
        it(`warns again on a fresh result after the last one was taken, ${result.what}`, () => {
          result.seed();
          toolCase.claim();
          result.again();

          expect(workAt(routeFor(toolCase.toolId))).toEqual({ kind: "unsaved", downloads: [] });
        });
      }

      // A claim is scoped to the tool that made it. Claiming under one id must
      // not answer for another's result, which a shared flag would.
      it("is not answered by another tool's claim", () => {
        for (const result of toolCase.results) result.seed();
        for (const other of OWN_STORE_CASES) {
          if (other.toolId === toolCase.toolId) continue;
          for (const result of other.results) result.seed();
          other.claim();
        }

        expect(workAt(routeFor(toolCase.toolId))).toEqual({ kind: "unsaved", downloads: [] });
      });

      // A default in the store is not a result. Without this, a busy check
      // written as "anything other than idle" passes the tests above and warns
      // on a page the user never ran anything on.
      it("reports nothing on a clean store", () => {
        expect(workAt(routeFor(toolCase.toolId))).toBeNull();
      });

      it("does not leak onto another tool's route", () => {
        toolCase.busy();
        for (const result of toolCase.results) result.seed();

        for (const other of OWN_STORE_CASES) {
          if (other.toolId === toolCase.toolId) continue;
          expect(workAt(routeFor(other.toolId))).toBeNull();
        }
        expect(workAt(TOOL_ROUTE)).toBeNull();
        expect(workAt("/automate")).toBeNull();
      });
    });
  }

  /**
   * tool-page resets most of these stores on tool navigation, so the claim map
   * would be the only thing still holding the result: for image-to-base64, every
   * base64 and dataUri of the last batch. Object keys are kept behind a WeakRef
   * for that reason, and strings as themselves, since a string cannot be weakly
   * held at all (new WeakRef("...") throws).
   */
  describe("how a claim is kept", () => {
    it("keeps an object key behind a weak reference", () => {
      useSplitStore.setState({ tiles: [SEED_TILE] });
      claimToolResult("split", splitResultKey(useSplitStore.getState().tiles, null));

      const claim = useToolResultClaims.getState().claimed.split;
      expect(claim).toBeInstanceOf(WeakRef);
      expect((claim as WeakRef<object>).deref()).toBe(useSplitStore.getState().tiles);
    });

    it("keeps a string key as itself", () => {
      useCollageStore.setState({ phase: "result", resultUrl: "blob:collage" });
      claimToolResult("collage", collageResultKey(useCollageStore.getState().resultUrl));

      expect(useToolResultClaims.getState().claimed.collage).toBe("blob:collage");
    });

    // A collected ref cannot be produced on demand (nothing forces a GC), so
    // this stands one in. The result is still on the page, and a claim that no
    // longer resolves must read as untaken rather than as taken.
    it("warns again when the claimed result has been collected", () => {
      useSplitStore.setState({ tiles: [SEED_TILE] });
      useToolResultClaims.setState({
        claimed: { split: { deref: () => undefined } as unknown as WeakRef<object> },
      });

      expect(workAt(routeFor("split"))).toEqual({ kind: "unsaved", downloads: [] });
    });
  });

  // The store check runs first, and then gives way: it does not narrow what the
  // file-store path can still find on these routes.
  it("still offers a file-store result on a covered tool's route", () => {
    seedResult();

    expect(workAt(routeFor("split"))).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:result", filename: "a-compressed.png" }],
    });
  });
});

/**
 * passport-photo held useToolProcessor for its error string alone and ran both
 * of its requests by hand, so nothing about it ever reached the file store: no
 * processing flag, no result. The guard was silent on a generated passport
 * photo, and the drift test called it covered (#1122).
 */
describe("passport-photo", () => {
  const PASSPORT_ROUTE = routeFor("passport-photo");

  // Its own case in OWN_STORE_CASES covers the generate half. The analysis is
  // the other request: a face-detection job the user sits and waits for.
  it("reports processing while the face analysis runs", () => {
    usePassportPhotoStore.setState({ analyzing: true });

    expect(workAt(PASSPORT_ROUTE)).toEqual({ kind: "processing" });
  });

  // The analysis fires on its own the moment a file is dropped. Warning about
  // it would mean a dialog on a page where the user has run nothing.
  it("stays quiet on an analysis with no generated photo behind it", () => {
    usePassportPhotoStore.setState({
      analyzeResult: {
        preview: "data:image/png;base64,aGk=",
        landmarks: {
          leftEye: { x: 0.4, y: 0.4 },
          rightEye: { x: 0.6, y: 0.4 },
          eyeCenter: { x: 0.5, y: 0.4 },
          chin: { x: 0.5, y: 0.8 },
          forehead: { x: 0.5, y: 0.3 },
          crown: { x: 0.5, y: 0.25 },
          nose: { x: 0.5, y: 0.55 },
          faceCenterX: 0.5,
        },
        imageWidth: 1000,
        imageHeight: 1400,
        jobId: "job-1",
        filename: "face.jpg",
      },
    });

    expect(workAt(PASSPORT_ROUTE)).toBeNull();
  });
});

/**
 * compare writes a blob url of the SECOND input image into the file store's
 * processedUrl so the before/after slider can show the two originals. That is
 * an input, not a result, and the guard cannot tell them apart: it offered that
 * image as a download, under the FIRST input's name (setProcessedUrl leaves
 * processedFilename null), and the claim that followed silenced the guard on
 * the diff the run actually produced (#1122).
 */
describe("compare", () => {
  const COMPARE_ROUTE = routeFor("compare");

  /** What the panel leaves in the store when a comparison lands. */
  function seedComparison(): void {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessedUrl("blob:second-image");
  }

  it("warns with nothing to download", () => {
    seedComparison();

    expect(workAt(COMPARE_ROUTE)).toEqual({ kind: "unsaved", downloads: [] });
  });

  // The name the old download would have carried, which is the giveaway that
  // the url is not a result: image B saved as image A.
  it("has no result filename to offer in the first place", () => {
    seedComparison();

    expect(useFileStore.getState().entries[0].processedFilename).toBeNull();
  });

  it("reports nothing before a comparison has run", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);

    expect(workAt(COMPARE_ROUTE)).toBeNull();
  });

  // The panel's own link claims the entry, so taking the diff answers the
  // guard. Nothing else claims on this page.
  it("goes quiet once the diff has been taken", () => {
    seedComparison();
    useFileStore.getState().claimSelected();

    expect(workAt(COMPARE_ROUTE)).toBeNull();
  });

  it("reports processing while the comparison runs", () => {
    seedComparison();
    useFileStore.getState().setProcessing(true);

    expect(workAt(COMPARE_ROUTE)).toEqual({ kind: "processing" });
  });

  // Scoped to the route, not to the shape of the entry: the same store on any
  // other tool's page is a real result and is still offered.
  it("does not silence the download on another tool's route", () => {
    seedComparison();

    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: "blob:second-image", filename: "a.png" }],
    });
  });
});

/**
 * sign-pdf hand-rolls its request, so none of useToolProcessor's reporting runs
 * for it. It writes the run and the result into the file store itself (#1111),
 * which puts it back on the ordinary path these tests cover. Pinned on the route
 * the app really serves it at, because the guard scopes on the route.
 */
describe("sign-pdf", () => {
  const SIGN_ROUTE = routeFor("sign-pdf");
  const SIGNED_URL = "/api/v1/download/job-1/contract_signed.pdf";

  function seedSigned(): void {
    useFileStore.getState().setFiles([makeFile("contract.pdf")]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: SIGNED_URL,
      processedFilename: "contract_signed.pdf",
      status: "completed",
    });
  }

  it("reports processing while the sign is in flight", () => {
    useFileStore.getState().setFiles([makeFile("contract.pdf")]);
    useFileStore.getState().setProcessing(true);

    expect(workAt(SIGN_ROUTE)).toEqual({ kind: "processing" });
  });

  it("offers the signed pdf while it is still untaken", () => {
    seedSigned();

    expect(workAt(SIGN_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: SIGNED_URL, filename: "contract_signed.pdf" }],
    });
  });

  it("goes quiet once the signed pdf has been taken", () => {
    seedSigned();
    useFileStore.getState().markClaimed(0);

    expect(workAt(SIGN_ROUTE)).toBeNull();
  });
});
