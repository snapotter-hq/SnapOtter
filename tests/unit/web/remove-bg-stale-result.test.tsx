// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The processor's state as the page sees it. By default Phase 1 (background
// removal) has finished for the loaded file and exposes the mask's URL; a test
// can start from a run still in flight and finish it later.
const processor = vi.hoisted(() => ({
  processFiles: vi.fn(),
  processing: false,
  downloadUrl: "/api/v1/download/JOBA/a_mask.png" as string | null,
}));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: processor.processFiles,
    processAllFiles: vi.fn(),
    processing: processor.processing,
    error: null,
    downloadUrl: processor.downloadUrl,
    originalSize: 1000,
    processedSize: 500,
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { RemoveBgSettings } from "@/components/tools/remove-bg-settings";
import { useFileStore } from "@/stores/file-store";

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const download = () => screen.queryByTestId("remove-background-download");

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  processor.processFiles.mockClear();
  processor.processing = false;
  processor.downloadUrl = "/api/v1/download/JOBA/a_mask.png";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useFileStore.getState().setFiles([]);
});

describe("remove-background result after the files change (#2107)", () => {
  it("drops the finished result when a different file replaces the one it came from", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    render(<RemoveBgSettings />);
    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();

    // A second file joins, then the first goes: one file again, but not a.png.
    const b = png("b.png");
    act(() => useFileStore.getState().setFiles([a, b]));
    act(() => useFileStore.getState().setFiles([b]));

    expect(download()).not.toBeInTheDocument();
    expect(screen.queryByTestId("remove-background-download-effects")).not.toBeInTheDocument();
  });

  it("brings the result back when the file it came from is the only one loaded again", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    render(<RemoveBgSettings />);
    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();

    act(() => useFileStore.getState().setFiles([a, png("b.png")]));
    act(() => useFileStore.getState().setFiles([a]));

    expect(download()).toBeInTheDocument();
  });

  it("doesn't hand a run's result to a file swapped in while it ran", async () => {
    processor.processing = false;
    processor.downloadUrl = null;
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    const { rerender } = render(<RemoveBgSettings />);

    // Start the removal on a.png, then drop c.png in before it finishes.
    fireEvent.click(screen.getByTestId("remove-background-submit"));
    act(() => useFileStore.getState().setFiles([png("c.png")]));

    // a.png's job finishes; the processor reports its URL on the loaded entry.
    processor.downloadUrl = "/api/v1/download/JOBA/a_mask.png";
    rerender(<RemoveBgSettings />);

    expect(download()).not.toBeInTheDocument();
  });

  it("takes the result away when Undo clears it", async () => {
    useFileStore.getState().setFiles([png("a.png")]);
    const { rerender } = render(<RemoveBgSettings />);
    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();

    // Undo drops the entry's processed URL; the processor reports none.
    processor.downloadUrl = null;
    rerender(<RemoveBgSettings />);

    expect(download()).not.toBeInTheDocument();
  });

  it("keeps the finished result while the same file stays loaded", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    render(<RemoveBgSettings />);
    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();

    act(() => useFileStore.getState().setFiles([a]));

    expect(download()).toBeInTheDocument();
  });

  it("does not write the saved library id or auto-download when a new file replaces the entry mid-effects request (#2243)", async () => {
    const a = png("a.png");
    const b = png("b.png");
    useFileStore.getState().setFiles([a]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-a-v1" });
    useFileStore.getState().setLibrarySaveMode("overwrite");

    let resolveEffects: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveEffects = resolve;
          }),
      ),
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(resolveEffects).toBeDefined());

    act(() => {
      useFileStore.getState().setFiles([b]);
    });

    await act(async () => {
      resolveEffects?.(
        new Response(
          JSON.stringify({
            downloadUrl: "/api/v1/download/JOBA/a_effects.png",
            savedFileId: "lib-a-v2",
          }),
          { status: 200 },
        ),
      );
    });

    const state = useFileStore.getState();
    expect(state.entries[0].file).toBe(b);
    expect(state.entries[0].serverFileId).toBeUndefined();
    expect(state.lastSavedLibraryFileId).toBeNull();
    expect(state.entries[0].claimed).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("does not overwrite serverFileId or auto-download when the selected entry's file changes in place mid-effects request (#2243)", async () => {
    const a = png("a.png");
    const b = png("b.png");
    useFileStore.getState().setFiles([a]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-a-v1" });
    useFileStore.getState().setLibrarySaveMode("overwrite");

    let resolveEffects: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveEffects = resolve;
          }),
      ),
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(resolveEffects).toBeDefined());

    act(() => {
      useFileStore.getState().updateEntry(0, { file: b, serverFileId: undefined });
    });

    await act(async () => {
      resolveEffects?.(
        new Response(
          JSON.stringify({
            downloadUrl: "/api/v1/download/JOBA/a_effects.png",
            savedFileId: "lib-a-v2",
          }),
          { status: 200 },
        ),
      );
    });

    const state = useFileStore.getState();
    expect(state.entries[0].file).toBe(b);
    expect(state.entries[0].serverFileId).toBeUndefined();
    expect(state.lastSavedLibraryFileId).toBeNull();
    expect(state.entries[0].claimed).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("does not write the saved library id or auto-download when Undo clears the cutout mid-effects request (#2243)", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    useFileStore.getState().updateEntry(0, {
      serverFileId: "lib-a-v1",
      processedUrl: "/api/v1/download/JOBA/a_mask.png",
    });
    useFileStore.getState().setLibrarySaveMode("overwrite");

    let resolveEffects: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveEffects = resolve;
          }),
      ),
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { rerender } = render(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(resolveEffects).toBeDefined());

    act(() => {
      useFileStore.getState().undoProcessing();
    });
    processor.downloadUrl = null;
    rerender(<RemoveBgSettings />);

    await act(async () => {
      resolveEffects?.(
        new Response(
          JSON.stringify({
            downloadUrl: "/api/v1/download/JOBA/a_effects.png",
            savedFileId: "lib-a-v2",
          }),
          { status: 200 },
        ),
      );
    });

    const state = useFileStore.getState();
    expect(state.entries[0].serverFileId).toBe("lib-a-v1");
    expect(state.lastSavedLibraryFileId).toBeNull();
    expect(state.entries[0].claimed).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("ignores a stale effects response after Undo and a new Phase 1 removal on the same file (#2243)", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-a-v1" });
    useFileStore.getState().setLibrarySaveMode("overwrite");

    let resolveEffects: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveEffects = resolve;
          }),
      ),
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { rerender } = render(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(resolveEffects).toBeDefined());

    // Undo clears the processor's downloadUrl, and a fresh removal (JOBB) lands on the same file.
    processor.downloadUrl = null;
    rerender(<RemoveBgSettings />);
    fireEvent.click(screen.getByTestId("remove-background-submit"));
    processor.downloadUrl = "/api/v1/download/JOBB/a_mask.png";
    rerender(<RemoveBgSettings />);
    const freshDownloadBtn = await screen.findByTestId("remove-background-download-effects");
    expect(freshDownloadBtn).toBeEnabled();

    await act(async () => {
      resolveEffects?.(
        new Response(
          JSON.stringify({
            downloadUrl: "/api/v1/download/JOBA/a_effects.png",
            savedFileId: "lib-a-v2",
          }),
          { status: 200 },
        ),
      );
    });

    const state = useFileStore.getState();
    expect(state.entries[0].serverFileId).toBe("lib-a-v1");
    expect(state.lastSavedLibraryFileId).toBeNull();
    expect(state.entries[0].claimed).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("aborts the in-flight Phase 2 effects fetch on unmount and does not write or download if it resolves late (#2711)", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-a-v1" });
    useFileStore.getState().setLibrarySaveMode("overwrite");

    const signals: Array<AbortSignal | undefined> = [];
    let resolveEffects: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolveEffects = resolve;
        });
      }),
    );
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const { unmount } = render(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(resolveEffects).toBeDefined());
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);

    unmount();

    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      resolveEffects?.(
        new Response(
          JSON.stringify({
            downloadUrl: "/api/v1/download/JOBA/a_effects.png",
            savedFileId: "lib-a-v2",
          }),
          { status: 200 },
        ),
      );
    });

    const state = useFileStore.getState();
    expect(state.entries[0].serverFileId).toBe("lib-a-v1");
    expect(state.lastSavedLibraryFileId).toBeNull();
    expect(state.entries[0].claimed).toBe(false);
    expect(clickSpy).not.toHaveBeenCalled();

    // A remount after an unmounted in-flight 500 or 410 response must not show a stale error or restart Phase 1.
    for (const badStatus of [500, 410] as const) {
      processor.processFiles.mockClear();
      resolveEffects = undefined;
      const view = render(<RemoveBgSettings />);
      fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
      await waitFor(() => expect(resolveEffects).toBeDefined());
      view.unmount();
      expect(signals.at(-1)?.aborted).toBe(true);

      await act(async () => {
        resolveEffects?.(
          new Response(
            JSON.stringify(
              badStatus === 410 ? { code: "BACKGROUND_REMOVAL_EXPIRED" } : { error: "Boom" },
            ),
            { status: badStatus },
          ),
        );
      });

      expect(processor.processFiles).not.toHaveBeenCalled();
      const remounted = render(<RemoveBgSettings />);
      expect(await screen.findByTestId("remove-background-download-effects")).toBeInTheDocument();
      expect(screen.queryByText("Boom")).toBeNull();
      remounted.unmount();
    }
  });

  it("aborts the in-flight Phase 2 effects fetch immediately when the active file changes or Undo clears the cutout in useFileStore (#2711)", async () => {
    const a = png("a.png");
    const b = png("b.png");
    useFileStore.getState().setFiles([a]);
    useFileStore.getState().updateEntry(0, {
      serverFileId: "lib-a-v1",
      processedUrl: "/api/v1/download/JOBA/a_mask.png",
    });
    useFileStore.getState().setLibrarySaveMode("overwrite");

    const signals: Array<AbortSignal | undefined> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signals.push(init?.signal ?? undefined);
        return new Promise<Response>(() => {});
      }),
    );

    const { rerender } = render(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(signals[0]).toBeInstanceOf(AbortSignal));
    expect(signals[0]?.aborted).toBe(false);

    act(() => {
      useFileStore.getState().setFiles([b]);
    });

    expect(signals[0]?.aborted).toBe(true);

    // Undo clearing the cutout on a single file also aborts an in-flight Phase 2 request.
    act(() => {
      useFileStore.getState().setFiles([a]);
      useFileStore.getState().updateEntry(0, {
        serverFileId: "lib-a-v1",
        processedUrl: "/api/v1/download/JOBA/a_mask.png",
      });
    });
    rerender(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() => expect(signals[1]).toBeInstanceOf(AbortSignal));
    expect(signals[1]?.aborted).toBe(false);

    act(() => {
      useFileStore.getState().undoProcessing();
    });

    expect(signals[1]?.aborted).toBe(true);
  });

  it("rejects non-JSON and malformed 2xx effects responses with invalidResponse (#3496)", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    useFileStore.getState().updateEntry(0, {
      serverFileId: "lib-a-v1",
      processedUrl: "/api/v1/download/JOBA/a_mask.png",
    });
    useFileStore.getState().setLibrarySaveMode("overwrite");
    useFileStore.getState().setLastSavedLibraryFileId(null);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    for (const badBody of [
      "<html>gateway</html>",
      "null",
      "{}",
      "[]",
      JSON.stringify({ downloadUrl: "", savedFileId: "lib-a-v2" }),
      JSON.stringify({
        downloadUrl: "/api/v1/download/JOBA/a_effects.png",
        savedFileId: 123,
      }),
      JSON.stringify({
        downloadUrl: "/api/v1/download/JOBA/a_effects.png",
        savedFileId: "",
      }),
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { unmount } = render(<RemoveBgSettings />);
      fireEvent.click(await screen.findByTestId("remove-background-download-effects"));

      await waitFor(() => expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument());
      expect(clickSpy).not.toHaveBeenCalled();
      expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
      expect(useFileStore.getState().entries[0].serverFileId).toBe("lib-a-v1");
      expect(useFileStore.getState().entries[0].claimed).toBe(false);
      unmount();
    }

    // Rethrows non-SyntaxError body read failures on effects response.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: () => Promise.reject(new TypeError("Effects stream disconnected")),
      })) as unknown as typeof fetch,
    );
    const { unmount } = render(<RemoveBgSettings />);
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));
    await waitFor(() =>
      expect(screen.getByText("Effects stream disconnected")).toBeInTheDocument(),
    );
    expect(clickSpy).not.toHaveBeenCalled();
    unmount();
  });
});
