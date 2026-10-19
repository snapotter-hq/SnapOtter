// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imagePreviewMock = vi.hoisted(() => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/image-preview", () => imagePreviewMock);

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  // formatHeaders() in @/lib/api reads this; without it the save handler
  // throws into its own catch and never reaches the claim.
  getDistinctId: () => null,
}));

vi.mock("@/components/feedback/tool-feedback-prompt", () => ({
  ToolFeedbackPrompt: () => null,
}));

import { ReviewPanel } from "@/components/common/review-panel";
import { useFileStore } from "@/stores/file-store";
import { useSaveToFilesStore } from "@/stores/save-to-files-store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["x"], "a.png", { type: "image/png" })]);
  useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });
  // Save state is per result URL and outlives the panel (#1502); every test
  // here renders the same URL.
  useSaveToFilesStore.getState().reset();
});

function renderPanel() {
  return render(
    <MemoryRouter>
      <ReviewPanel
        filename="a-resized.png"
        fileSize={100}
        fileType="image/png"
        originalSize={200}
        downloadUrl="blob:result"
        onUndo={() => {}}
        onStartOver={() => {}}
        currentToolId="resize"
      />
    </MemoryRouter>,
  );
}

describe("ReviewPanel claim tracking", () => {
  it("claims the entry when the result is downloaded", () => {
    const { container } = renderPanel();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);

    const button = container.querySelector("[data-download-button]");
    expect(button).not.toBeNull();
    fireEvent.click(button as HTMLElement);

    expect(useFileStore.getState().entries[0].claimed).toBe(true);
  });

  it("claims the entry that was saved, not the one selected when the upload returns", async () => {
    useFileStore
      .getState()
      .setFiles([
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["y"], "b.png", { type: "image/png" }),
      ]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });
    expect(useFileStore.getState().selectedIndex).toBe(0);

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    // Let the handler reach the upload, which stays pending below.
    await act(async () => {});

    // The user browses to another file while the upload is still in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    // Diagnosis insurance: handleSaveToFiles swallows everything into a bare
    // catch, so without this a broken fetch or header helper reads as a claim
    // bug and points at the wrong subsystem.
    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();

    const { entries } = useFileStore.getState();
    expect(entries[0].claimed).toBe(true);
    expect(entries[1].claimed).toBe(false);
  });

  it("claims the entry that was saved even when the files are reordered mid-save (#1114)", async () => {
    useFileStore
      .getState()
      .setFiles([
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["y"], "b.png", { type: "image/png" }),
        new File(["z"], "c.png", { type: "image/png" }),
      ]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });
    const savedId = useFileStore.getState().entries[0].id;

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    // Drag a.png from index 0 to index 2 while the library upload is in flight.
    act(() => {
      useFileStore.getState().reorderFiles(0, 2);
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();

    const { entries } = useFileStore.getState();
    expect(entries.map((e) => [e.id === savedId, e.claimed])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
  });

  it("claims the entry that was saved when an earlier file is removed mid-save (#1777)", async () => {
    useFileStore
      .getState()
      .setFiles([
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["y"], "b.png", { type: "image/png" }),
        new File(["z"], "c.png", { type: "image/png" }),
      ]);
    useFileStore.getState().updateEntry(1, { processedUrl: "blob:result" });
    useFileStore.getState().setSelectedIndex(1);
    const savedId = useFileStore.getState().entries[1].id;

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    // Removing a.png shifts b.png from index 1 to index 0 while the upload is in flight.
    act(() => {
      useFileStore.getState().removeFile(0);
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();

    const { entries } = useFileStore.getState();
    expect(entries.map((e) => [e.id === savedId, e.claimed])).toEqual([
      [true, true],
      [false, false],
    ]);
  });

  it("claims the entry that was saved when the file order is reversed mid-save (#1777)", async () => {
    useFileStore
      .getState()
      .setFiles([
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["y"], "b.png", { type: "image/png" }),
        new File(["z"], "c.png", { type: "image/png" }),
      ]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });
    const savedId = useFileStore.getState().entries[0].id;

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    act(() => {
      useFileStore.getState().reverseFiles();
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();

    const { entries } = useFileStore.getState();
    expect(entries.map((e) => [e.id === savedId, e.claimed])).toEqual([
      [false, false],
      [false, false],
      [true, true],
    ]);
  });

  it("does not claim any remaining entry when the saved file itself is removed mid-save (#1777)", async () => {
    useFileStore
      .getState()
      .setFiles([
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["y"], "b.png", { type: "image/png" }),
      ]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    act(() => {
      useFileStore.getState().removeFile(0);
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();

    const { entries } = useFileStore.getState();
    expect(entries).toHaveLength(1);
    expect(entries[0].claimed).toBe(false);
  });

  it("does not claim a new result when the entry is re-run while the old save is in flight (#1777)", async () => {
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    // A second run lands a new result on the same entry before the first upload finishes.
    act(() => {
      useFileStore.getState().updateEntry(0, { processedUrl: "blob:result-second-run" });
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();
    expect(useFileStore.getState().entries[0].processedUrl).toBe("blob:result-second-run");
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("does not claim an entry whose result was cleared by undoProcessing mid-save (#1777)", async () => {
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });

    let resolveUpload: ((res: { ok: boolean }) => void) | undefined;
    const upload = new Promise<{ ok: boolean }>((resolve) => {
      resolveUpload = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : upload,
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    act(() => {
      useFileStore.getState().undoProcessing();
    });

    await act(async () => {
      resolveUpload?.({ ok: true });
      await upload;
    });
    await act(async () => {});

    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("claims the entry matching downloadUrl when selectedIndex already points elsewhere (#1777)", async () => {
    useFileStore
      .getState()
      .setFiles([
        new File(["x"], "a.png", { type: "image/png" }),
        new File(["y"], "b.png", { type: "image/png" }),
      ]);
    useFileStore.getState().updateEntry(0, { processedUrl: "blob:result" });
    useFileStore.getState().updateEntry(1, { processedUrl: "blob:other" });
    useFileStore.getState().setSelectedIndex(1);

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : Promise.resolve({ ok: true }),
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();

    const { entries } = useFileStore.getState();
    expect(entries[0].claimed).toBe(true);
    expect(entries[1].claimed).toBe(false);
  });

  it("does not claim an unprocessed entry when no store entry matches downloadUrl (#1777)", async () => {
    useFileStore.getState().undoProcessing();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        input === "blob:result"
          ? Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["result"])) })
          : Promise.resolve({ ok: true }),
      ),
    );

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
    await act(async () => {});

    expect(await screen.findByRole("button", { name: /saved to files/i })).toBeTruthy();
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });
});
