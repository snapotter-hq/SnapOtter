// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imagePreviewMock = vi.hoisted(() => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/image-preview", () => imagePreviewMock);

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

import { useFileStore } from "@/stores/file-store";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  useFileStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("file store claim tracking", () => {
  it("starts every entry unclaimed", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
    expect(useFileStore.getState().batchZipClaimed).toBe(false);
  });

  it("marks the named entry claimed", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().markClaimed(0);

    const { entries } = useFileStore.getState();
    expect(entries[0].claimed).toBe(true);
    expect(entries[1].claimed).toBe(false);
  });

  it("claims an entry that is not the selected one", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().markClaimed(1);

    const { entries, selectedIndex } = useFileStore.getState();
    expect(selectedIndex).toBe(0);
    expect(entries[1].claimed).toBe(true);
  });

  it("ignores a claim for an entry that is not there", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().markClaimed(7);

    const { entries } = useFileStore.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0].claimed).toBe(false);
  });

  it("marks every entry claimed when the batch zip is taken", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setBatchZip(new Blob(["z"]), "out.zip");
    useFileStore.getState().markBatchClaimed();

    const state = useFileStore.getState();
    expect(state.batchZipClaimed).toBe(true);
    expect(state.entries.every((e) => e.claimed)).toBe(true);
  });

  it("treats a new batch zip as unclaimed", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setBatchZip(new Blob(["z"]), "out.zip");
    useFileStore.getState().markBatchClaimed();
    useFileStore.getState().setBatchZip(new Blob(["z2"]), "out2.zip");

    expect(useFileStore.getState().batchZipClaimed).toBe(false);
  });

  it("starts a new file set unclaimed", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().markClaimed(0);
    useFileStore.getState().setFiles([makeFile("c.png")]);

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("drops the previous batch zip when a new file set arrives", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setBatchZip(new Blob(["z"]), "out.zip");
    useFileStore.getState().markBatchClaimed();
    useFileStore.getState().setFiles([makeFile("c.png")]);

    const state = useFileStore.getState();
    expect(state.batchZipBlob).toBeNull();
    expect(state.batchZipFilename).toBeNull();
    expect(state.batchZipClaimed).toBe(false);
  });

  it("clears entries and the batch zip claim on reset", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setBatchZip(new Blob(["z"]), "out.zip");
    useFileStore.getState().markBatchClaimed();
    expect(useFileStore.getState().batchZipClaimed).toBe(true);

    useFileStore.getState().reset();

    const state = useFileStore.getState();
    expect(state.entries).toHaveLength(0);
    expect(state.batchZipClaimed).toBe(false);
  });
});

describe("a changed result invalidates its claim", () => {
  it("unclaims an entry that gets a new processed url through updateEntry", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().markClaimed(0);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:second-run" });

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("unclaims an entry whose processed url is cleared through updateEntry", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().markClaimed(0);
    useFileStore.getState().updateEntry(0, { processedUrl: null });

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("keeps the claim when the patch leaves the processed url alone", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().markClaimed(0);
    useFileStore.getState().updateEntry(0, { processedSize: 123 });

    expect(useFileStore.getState().entries[0].claimed).toBe(true);
  });

  it("unclaims the selected entry when setProcessedUrl lands a result", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().markClaimed(0);
    useFileStore.getState().setProcessedUrl("blob:second-run");

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("unclaims the selected entry when setProcessedUrl clears the result", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().markClaimed(0);
    useFileStore.getState().setProcessedUrl(null);

    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("clears every claim when undoProcessing drops the results", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setBatchZip(new Blob(["z"]), "out.zip");
    useFileStore.getState().markBatchClaimed();
    useFileStore.getState().undoProcessing();

    const state = useFileStore.getState();
    expect(state.entries.some((e) => e.claimed)).toBe(false);
    expect(state.batchZipClaimed).toBe(false);
  });
});
