// @vitest-environment jsdom

/**
 * The library modal's list fetch (#1933) and import (#1948): a failed fetch or
 * download has to read as a failure rather than vanish silently, ticked files
 * hidden by a search still import, and only the newest request may write state.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiListFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiListFiles };
});

import { AuthImage, FileLibraryModal } from "@/components/common/file-library-modal";
import type { UserFile } from "@/lib/api";

function userFile(id: string, originalName: string): UserFile {
  return { id, originalName, mimeType: "image/png" } as UserFile;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type ListResult = { files: UserFile[]; total: number };

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    shouldAdvanceTime: true,
  });
  // Thumbnails fetch on their own; they stay pending and aren't under test.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  apiListFiles.mockReset();
});

describe("FileLibraryModal list fetch (#1933)", () => {
  it("shows a load error with a retry, not the empty library, when the fetch fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("API down");
    apiListFiles.mockRejectedValueOnce(cause);

    render(<FileLibraryModal open onClose={() => {}} onImport={() => {}} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(en.files.loadFailed);
    expect(screen.queryByText(en.files.noFilesFound)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), cause);

    apiListFiles.mockResolvedValueOnce({ files: [userFile("a", "otter.png")], total: 1 });
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));

    expect(await screen.findByText("otter.png")).toBeInTheDocument();
    expect(screen.queryByText(en.files.loadFailed)).not.toBeInTheDocument();
    expect(apiListFiles).toHaveBeenCalledTimes(2);
  });

  it("keeps the search term when retrying a failed search", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiListFiles.mockResolvedValueOnce({ files: [], total: 0 });
    render(<FileLibraryModal open onClose={() => {}} onImport={() => {}} />);
    await waitFor(() => expect(apiListFiles).toHaveBeenCalledTimes(1));

    apiListFiles.mockRejectedValueOnce(new Error("API down"));
    fireEvent.change(screen.getByPlaceholderText(en.files.searchPlaceholder), {
      target: { value: "otter" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(await screen.findByText(en.files.loadFailed)).toBeInTheDocument();

    apiListFiles.mockResolvedValueOnce({ files: [], total: 0 });
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    await waitFor(() => expect(apiListFiles).toHaveBeenCalledTimes(3));
    expect(apiListFiles.mock.calls[2][0]).toMatchObject({ search: "otter" });
  });

  it("drops the previous list and its ticks when a later search fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    apiListFiles.mockResolvedValueOnce({ files: [userFile("a", "beaver.png")], total: 1 });
    render(<FileLibraryModal open onClose={() => {}} onImport={() => {}} />);
    fireEvent.click(await screen.findByText("beaver.png"));
    expect(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
      }),
    ).toBeEnabled();

    apiListFiles.mockRejectedValueOnce(new Error("API down"));
    fireEvent.change(screen.getByPlaceholderText(en.files.searchPlaceholder), {
      target: { value: "otter" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(await screen.findByText(en.files.loadFailed)).toBeInTheDocument();
    expect(screen.queryByText("beaver.png")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.commonUi.fileLibrary.import })).toBeDisabled();
  });

  it("ignores a search answer that lands after a reopen's unfiltered list", async () => {
    apiListFiles.mockResolvedValueOnce({ files: [], total: 0 });
    const { rerender } = render(<FileLibraryModal open onClose={() => {}} onImport={() => {}} />);
    await waitFor(() => expect(apiListFiles).toHaveBeenCalledTimes(1));

    // The search goes out and is still in flight when the modal closes.
    const staleSearch = deferred<ListResult>();
    apiListFiles.mockReturnValueOnce(staleSearch.promise);
    fireEvent.change(screen.getByPlaceholderText(en.files.searchPlaceholder), {
      target: { value: "otter" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(apiListFiles).toHaveBeenCalledTimes(2);

    rerender(<FileLibraryModal open={false} onClose={() => {}} onImport={() => {}} />);
    const reopenList = deferred<ListResult>();
    apiListFiles.mockReturnValueOnce(reopenList.promise);
    rerender(<FileLibraryModal open onClose={() => {}} onImport={() => {}} />);
    expect(apiListFiles).toHaveBeenCalledTimes(3);

    await act(async () => {
      reopenList.resolve({
        files: [userFile("a", "beaver.png"), userFile("b", "otter.png")],
        total: 2,
      });
    });
    expect(await screen.findByText("beaver.png")).toBeInTheDocument();

    await act(async () => {
      staleSearch.resolve({ files: [userFile("b", "otter.png")], total: 1 });
    });
    expect(screen.getByText("beaver.png")).toBeInTheDocument();
    expect(screen.getByText("otter.png")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(en.files.searchPlaceholder)).toHaveValue("");
  });

  it("ignores a stale failure, and a stale answer doesn't end the newer request's spinner", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const first = deferred<ListResult>();
    apiListFiles.mockReturnValueOnce(first.promise);
    render(<FileLibraryModal open onClose={() => {}} onImport={() => {}} />);

    const second = deferred<ListResult>();
    apiListFiles.mockReturnValueOnce(second.promise);
    fireEvent.change(screen.getByPlaceholderText(en.files.searchPlaceholder), {
      target: { value: "otter" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(apiListFiles).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.reject(new Error("old request failed"));
    });
    expect(screen.queryByText(en.files.loadFailed)).not.toBeInTheDocument();
    expect(screen.queryByText(en.files.noFilesFound)).not.toBeInTheDocument();

    await act(async () => {
      second.resolve({ files: [userFile("b", "otter.png")], total: 1 });
    });
    expect(await screen.findByText("otter.png")).toBeInTheDocument();
  });
});

function downloadFetchStub(
  handler: (id: string) => Promise<Response> | Response,
): ReturnType<typeof vi.fn> {
  const spy = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const match = /\/files\/([^/]+)\/download$/.exec(url);
    if (match) {
      return Promise.resolve().then(() => handler(decodeURIComponent(match[1])));
    }
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("FileLibraryModal import (#1948)", () => {
  it("keeps the modal open, shows an alert, and logs each failure when all downloads fail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    const onImport = vi.fn();
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("a", "beaver.png"), userFile("b", "otter.png")],
      total: 2,
    });
    downloadFetchStub(() => new Response("Not found", { status: 404 }));

    render(<FileLibraryModal open onClose={onClose} onImport={onImport} />);
    fireEvent.click(await screen.findByText("beaver.png"));
    fireEvent.click(screen.getByText("otter.png"));
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 2 of 2 files.");
    expect(onImport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    ).toBeEnabled();

    // Toggling a selection clears the alert.
    fireEvent.click(screen.getByText("beaver.png"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("imports the good files, keeps the failed ones ticked, and stays open with the failure count", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    const onImport = vi.fn();
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("a", "beaver.png"), userFile("b", "otter.png")],
      total: 2,
    });
    downloadFetchStub((id) =>
      id === "a"
        ? new Response("Not found", { status: 404 })
        : new Response("png-bytes", { status: 200 }),
    );

    render(<FileLibraryModal open onClose={onClose} onImport={onImport} />);
    fireEvent.click(await screen.findByText("beaver.png"));
    fireEvent.click(screen.getByText("otter.png"));
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");
    expect(onImport).toHaveBeenCalledTimes(1);
    const imported = onImport.mock.calls[0][0] as File[];
    expect(imported.map((f) => ({ name: f.name, type: f.type }))).toEqual([
      { name: "otter.png", type: "image/png" },
    ]);
    expect(onClose).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    // Only the failed file remains ticked so retrying doesn't re-import otter.png.
    const retryBtn = screen.getByRole("button", {
      name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
    });
    expect(retryBtn).toBeEnabled();

    downloadFetchStub(() => new Response("beaver-bytes", { status: 200 }));
    fireEvent.click(retryBtn);

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(2));
    const retried = onImport.mock.calls[1][0] as File[];
    expect(retried.map((f) => f.name)).toEqual(["beaver.png"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("catches a rejected download fetch without an unhandled rejection", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const netErr = new TypeError("Failed to fetch");
      apiListFiles.mockResolvedValueOnce({
        files: [userFile("a", "otter.png")],
        total: 1,
      });
      downloadFetchStub(() => Promise.reject(netErr));

      const onClose = vi.fn();
      const onImport = vi.fn();
      render(<FileLibraryModal open onClose={onClose} onImport={onImport} />);
      fireEvent.click(await screen.findByText("otter.png"));
      fireEvent.click(
        screen.getByRole("button", {
          name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
        }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 1 files.");
      expect(consoleError).toHaveBeenCalledWith(expect.any(String), netErr);
      expect(onImport).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("imports ticked files that a later search hid, matching the Import (N) count", async () => {
    const onClose = vi.fn();
    const onImport = vi.fn();
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("a", "beaver.png"), userFile("b", "otter.png")],
      total: 2,
    });
    downloadFetchStub((id) => new Response(id, { status: 200 }));

    render(<FileLibraryModal open onClose={onClose} onImport={onImport} />);
    fireEvent.click(await screen.findByText("beaver.png"));

    // Search filters out beaver.png, leaving only otter.png visible.
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("b", "otter.png")],
      total: 1,
    });
    fireEvent.change(screen.getByPlaceholderText(en.files.searchPlaceholder), {
      target: { value: "otter" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(screen.queryByText("beaver.png")).not.toBeInTheDocument());

    // Select-all checkbox must not appear checked when otter.png is unticked.
    const selectAll = screen.getByRole("checkbox");
    expect(selectAll).not.toBeChecked();

    // Ticking select-all ticks visible otter.png while keeping hidden beaver.png.
    fireEvent.click(selectAll);
    expect(selectAll).toBeChecked();
    expect(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    ).toBeEnabled();

    // Unticking select-all unticks visible otter.png while keeping hidden beaver.png.
    fireEvent.click(selectAll);
    expect(selectAll).not.toBeChecked();
    expect(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
      }),
    ).toBeEnabled();

    // Tick otter.png back, then run an empty search; select-all on an empty view
    // is a no-op and must not wipe hidden ticks.
    fireEvent.click(selectAll);
    apiListFiles.mockResolvedValueOnce({ files: [], total: 0 });
    fireEvent.change(screen.getByPlaceholderText(en.files.searchPlaceholder), {
      target: { value: "walrus" },
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(await screen.findByText(en.files.noFilesFound)).toBeInTheDocument();
    fireEvent.click(selectAll);

    const importBtn = screen.getByRole("button", {
      name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
    });
    expect(importBtn).toBeEnabled();
    fireEvent.click(importBtn);

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    const imported = onImport.mock.calls[0][0] as File[];
    expect(imported.map((f) => f.name)).toEqual(["beaver.png", "otter.png"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores a download that settles after the modal closes, reopens, or unmounts", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    const onImport = vi.fn();
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("a", "otter.png")],
      total: 1,
    });
    const slowDownload = deferred<Response>();
    downloadFetchStub(() => slowDownload.promise);

    const { rerender, unmount } = render(
      <FileLibraryModal open onClose={onClose} onImport={onImport} />,
    );
    fireEvent.click(await screen.findByText("otter.png"));
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
      }),
    );

    rerender(<FileLibraryModal open={false} onClose={onClose} onImport={onImport} />);
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("a", "otter.png")],
      total: 1,
    });
    rerender(<FileLibraryModal open onClose={onClose} onImport={onImport} />);
    expect(await screen.findByText("otter.png")).toBeInTheDocument();

    // Start a second import in the reopened modal before the stale one fails.
    const secondDownload = deferred<Response>();
    downloadFetchStub(() => secondDownload.promise);
    fireEvent.click(screen.getByText("otter.png"));
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "1"),
      }),
    );

    await act(async () => {
      slowDownload.resolve(new Response("Not found", { status: 404 }));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.commonUi.fileLibrary.importing })).toBeDisabled();

    // Unmount while the second import is still in flight; its late 200 is ignored.
    unmount();
    await act(async () => {
      secondDownload.resolve(new Response("png", { status: 200 }));
    });
    expect(onImport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open and preserves checkedIds when onImport returns false, including when onImport updates while downloads are in flight (#3197)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onClose = vi.fn();
    const initialOnImport = vi.fn<(_files: File[]) => boolean | undefined>(() => undefined);
    const refusingOnImport = vi.fn<(_files: File[]) => boolean | undefined>(() => false);
    const acceptingOnImport = vi.fn<(_files: File[]) => boolean | undefined>(() => undefined);
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("a", "beaver.png"), userFile("b", "otter.png")],
      total: 2,
    });
    const inFlightGate = deferred<void>();
    downloadFetchStub(async () => {
      await inFlightGate.promise;
      return new Response("png-bytes", { status: 200 });
    });

    const { rerender } = render(
      <FileLibraryModal open onClose={onClose} onImport={initialOnImport} />,
    );
    fireEvent.click(await screen.findByText("beaver.png"));
    fireEvent.click(screen.getByText("otter.png"));
    const importTwoBtn = screen.getByRole("button", {
      name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
    });
    fireEvent.click(importTwoBtn);

    // Parent updates onImport to refuse intake while the download is still in flight.
    rerender(<FileLibraryModal open onClose={onClose} onImport={refusingOnImport} />);
    await act(async () => {
      inFlightGate.resolve();
    });

    await waitFor(() => expect(refusingOnImport).toHaveBeenCalledTimes(1));
    expect(initialOnImport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    ).toBeEnabled();

    // Even when one download fails and one succeeds while onImport returns false,
    // both files stay ticked so neither is lost when retrying after the run finishes.
    downloadFetchStub((id) =>
      id === "a"
        ? new Response("Not found", { status: 404 })
        : new Response("png-bytes", { status: 200 }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't import 1 of 2 files.");
    expect(refusingOnImport).toHaveBeenCalledTimes(2);
    expect(onClose).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    ).toBeEnabled();

    // Once intake is accepted again, retrying imports both files and closes the modal.
    rerender(<FileLibraryModal open onClose={onClose} onImport={acceptingOnImport} />);
    downloadFetchStub(() => new Response("png-bytes", { status: 200 }));
    fireEvent.click(
      screen.getByRole("button", {
        name: en.commonUi.fileLibrary.importCount.replace("{count}", "2"),
      }),
    );

    await waitFor(() => expect(acceptingOnImport).toHaveBeenCalledTimes(1));
    const imported = acceptingOnImport.mock.calls[0][0] as File[];
    expect(imported.map((f) => f.name)).toEqual(["beaver.png", "otter.png"]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("FileLibraryModal AuthImage (#2957)", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:thumb"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("resets failed state when src changes from a failing thumbnail URL to a working one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/f1/")) {
          return new Response("Not found", { status: 404 });
        }
        return new Response("png-bytes", {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });
      }),
    );

    const view = render(<AuthImage src="/api/v1/files/f1/thumbnail" alt="thumbnail" />);
    await waitFor(() => {
      expect(view.container.querySelector(".animate-spin")).toBeNull();
    });
    expect(screen.queryByRole("img")).toBeNull();

    view.rerender(<AuthImage src="/api/v1/files/f2/thumbnail" alt="thumbnail" />);

    const img = await screen.findByRole("img", { name: "thumbnail" });
    expect(img).toHaveAttribute("src", "blob:thumb");

    view.rerender(<AuthImage src="/api/v1/files/f1/thumbnail" alt="thumbnail" />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb");
    await waitFor(() => {
      expect(screen.queryByRole("img")).toBeNull();
    });

    vi.mocked(URL.revokeObjectURL).mockClear();
    view.rerender(<AuthImage src="/api/v1/files/f2/thumbnail" alt="thumbnail" />);
    expect(await screen.findByRole("img", { name: "thumbnail" })).toHaveAttribute(
      "src",
      "blob:thumb",
    );

    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb");
  });

  it("aborts in-flight fetch and ignores late blob resolution or rejection after src changes", async () => {
    const firstFetch = deferred<Response>();
    const secondFetch = deferred<Response>();
    const thirdFetch = deferred<Response>();
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        const url = String(input);
        if (url.includes("/f1/")) return firstFetch.promise;
        if (url.includes("/f2/")) return secondFetch.promise;
        return thirdFetch.promise;
      }),
    );

    const view = render(<AuthImage src="/api/v1/files/f1/thumbnail" alt="thumbnail" />);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    view.rerender(<AuthImage src="/api/v1/files/f2/thumbnail" alt="thumbnail" />);
    expect(signals[0].aborted).toBe(true);
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);

    await act(async () => {
      firstFetch.reject(new TypeError("Failed to fetch"));
    });
    expect(view.container.querySelector(".animate-spin")).not.toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    view.rerender(<AuthImage src="/api/v1/files/f3/thumbnail" alt="thumbnail" />);
    expect(signals[1].aborted).toBe(true);

    await act(async () => {
      secondFetch.resolve(
        new Response("stale-png-bytes", {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).toBeNull();

    await act(async () => {
      thirdFetch.resolve(
        new Response("png-bytes", {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );
    });
    expect(await screen.findByRole("img", { name: "thumbnail" })).toHaveAttribute(
      "src",
      "blob:thumb",
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("switches to the fallback icon when the modal thumbnail img fires an error event", async () => {
    apiListFiles.mockResolvedValueOnce({
      files: [userFile("a", "corrupt.png")],
      total: 1,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("not-an-image", {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
      ),
    );

    render(<FileLibraryModal open onClose={() => {}} onImport={() => {}} />);

    const img = await screen.findByRole("img", { name: "corrupt.png" });
    expect(img).toHaveAttribute("src", "blob:thumb");

    fireEvent.error(img);
    expect(screen.queryByRole("img", { name: "corrupt.png" })).toBeNull();
  });
});
