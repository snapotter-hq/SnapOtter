// @vitest-environment jsdom
import { SECTIONS } from "@snapotter/shared";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
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

import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { useEditorStore } from "@/stores/editor-store";
import { useFileStore } from "@/stores/file-store";

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

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  useFileStore.getState().reset();
  useEditorStore.setState({ isDirty: false });
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
      downloads: [{ kind: "result", url: "blob:result", filename: "a-compressed.png" }],
    });
  });

  it("falls back to the source filename when the result has none", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result", status: "completed" });

    expect(workAt(TOOL_ROUTE)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", url: "blob:result", filename: "a.png" }],
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
      downloads: [{ kind: "result", url: "blob:two", filename: "two.png" }],
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
      downloads: [{ kind: "result", url: "blob:result", filename: "out.png" }],
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
      downloads: [{ kind: "result", url: "blob:rerun", filename: "rerun.png" }],
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
      downloads: [{ kind: "result", url: "blob:result", filename: "a-compressed.png" }],
    });
  });

  // Not a normalizePath test: ownsFileStore's split/filter drops the empty last
  // segment on its own, so this stays green with normalizePath deleted. It pins
  // the segment counting, which a switch to a plain split() would break.
  it("counts segments on a tool route whose trailing slash is empty", () => {
    seedResult();

    expect(workAt(`${TOOL_ROUTE}/`)).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", url: "blob:result", filename: "a-compressed.png" }],
    });
  });

  // React Router matches case-insensitively unless a route sets caseSensitive,
  // and none do, so an uppercase URL renders the real page and has to be guarded.
  it("guards a tool route reached through an uppercase url", () => {
    seedResult();

    expect(workAt("/IMAGE/Compress-Image")).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", url: "blob:result", filename: "a-compressed.png" }],
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
        downloads: [{ kind: "result", url: "blob:result", filename: "a-compressed.png" }],
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
