// @vitest-environment jsdom

/**
 * The library modal's list fetch (#1933): a failed fetch has to read as a
 * failure, not as an empty library, and only the newest request may write the
 * list, so a slow search from before a close/reopen can't overwrite it.
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

import { FileLibraryModal } from "@/components/common/file-library-modal";
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
