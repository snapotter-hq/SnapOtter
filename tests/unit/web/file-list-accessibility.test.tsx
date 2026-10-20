// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiListFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiListFiles };
});

import { FileList } from "@/components/files/file-list";
import type { UserFile } from "@/lib/api";
import { useFilesPageStore } from "@/stores/files-page-store";

const files: UserFile[] = [
  {
    id: "image-file",
    originalName: "photo.png",
    mimeType: "image/png",
    size: 1024,
    width: 100,
    height: 100,
    version: 1,
    toolChain: [],
    createdAt: "2026-07-24T00:00:00.000Z",
  },
  {
    id: "video-file",
    originalName: "clip.mp4",
    mimeType: "video/mp4",
    size: 2048,
    width: 1920,
    height: 1080,
    version: 1,
    toolChain: [],
    createdAt: "2026-07-24T00:00:00.000Z",
  },
];

const initialState = useFilesPageStore.getInitialState();

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useFilesPageStore.setState(
    {
      ...initialState,
      files,
      total: files.length,
      checkedIds: new Set(),
      fetchFiles: vi.fn(async () => {}),
    },
    true,
  );
});

afterEach(() => {
  cleanup();
  useFilesPageStore.setState({ ...initialState, checkedIds: new Set() }, true);
  apiListFiles.mockReset();
  vi.restoreAllMocks();
});

describe("FileList accessibility", () => {
  it("uses native list items with separate file buttons and checkboxes", () => {
    render(<FileList />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("listbox")).toBeNull();

    const fileButton = screen.getByRole("button", { name: "photo.png" });
    const checkbox = screen.getByRole("checkbox", { name: "Select File: photo.png" });
    expect(fileButton.contains(checkbox)).toBe(false);
    const descriptionId = fileButton.getAttribute("aria-describedby");
    expect(descriptionId).not.toBeNull();
    expect(document.getElementById(descriptionId ?? "")?.textContent).toContain("Version 1");
    expect(document.getElementById(descriptionId ?? "")?.textContent).toContain("1.0 KB");
  });

  it("moves roving focus between file buttons with the arrow keys", () => {
    render(<FileList />);
    const imageButton = screen.getByRole("button", { name: "photo.png" });
    const videoButton = screen.getByRole("button", { name: "clip.mp4" });

    expect(imageButton.tabIndex).toBe(0);
    expect(videoButton.tabIndex).toBe(-1);
    imageButton.focus();
    fireEvent.keyDown(imageButton, { key: "ArrowDown" });

    expect(useFilesPageStore.getState().selectedFileId).toBe("video-file");
    expect(document.activeElement).toBe(videoButton);
    expect(imageButton.tabIndex).toBe(-1);
    expect(videoButton.tabIndex).toBe(0);
  });

  it("does not activate a disabled file through the keyboard", () => {
    const onFileActivate = vi.fn();
    useFilesPageStore.setState({ selectedFileId: "video-file" });
    render(<FileList filterMimePrefix="image/" onFileActivate={onFileActivate} />);
    const videoButton = screen.getByRole("button", { name: "clip.mp4" });

    expect((videoButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(videoButton, { key: "Enter" });
    fireEvent.click(videoButton);

    expect(onFileActivate).not.toHaveBeenCalled();
  });

  it("keeps filtered files available to independent bulk management", () => {
    render(<FileList filterMimePrefix="image/" />);
    const videoCheckbox = screen.getByRole("checkbox", { name: "Select File: clip.mp4" });
    const selectAll = screen.getByRole("checkbox", { name: "Select File: My Files" });

    expect((videoCheckbox as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(selectAll);

    expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["image-file", "video-file"]));
  });

  it("scopes select-all to visible files and preserves hidden ticks across searches (#2897)", async () => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout"],
      shouldAdvanceTime: true,
    });
    try {
      useFilesPageStore.setState({
        files,
        total: files.length,
        checkedIds: new Set(),
        fetchFiles: initialState.fetchFiles,
      });
      apiListFiles.mockResolvedValueOnce({ files, total: files.length });
      render(<FileList />);

      const imageCheckbox = await screen.findByRole("checkbox", { name: "Select File: photo.png" });
      const selectAll = screen.getByRole("checkbox", { name: "Select File: My Files" });

      fireEvent.click(imageCheckbox);
      expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["image-file"]));

      // Search for clip so visible files narrows to clip.mp4 only (files.length === 1 === checkedIds.size).
      apiListFiles.mockResolvedValueOnce({ files: [files[1]], total: 1 });
      fireEvent.change(screen.getByPlaceholderText("Search files..."), {
        target: { value: "clip" },
      });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.queryByRole("button", { name: "photo.png" })).not.toBeInTheDocument();
      expect(selectAll).not.toBeChecked();

      // Ticking select-all checks clip.mp4 while keeping hidden photo.png checked.
      fireEvent.click(selectAll);
      expect(selectAll).toBeChecked();
      expect(useFilesPageStore.getState().checkedIds).toEqual(
        new Set(["image-file", "video-file"]),
      );
      expect(screen.getByText("2 selected")).toBeInTheDocument();

      // Unticking select-all unchecks visible clip.mp4 while keeping hidden photo.png checked.
      fireEvent.click(selectAll);
      expect(selectAll).not.toBeChecked();
      expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["image-file"]));
      expect(screen.getByText("1 selected")).toBeInTheDocument();

      // Clicking select-all on an empty search result does not wipe hidden ticks.
      apiListFiles.mockResolvedValueOnce({ files: [], total: 0 });
      fireEvent.change(screen.getByPlaceholderText("Search files..."), {
        target: { value: "walrus" },
      });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(selectAll).not.toBeChecked();
      fireEvent.click(selectAll);
      expect(useFilesPageStore.getState().checkedIds).toEqual(new Set(["image-file"]));
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("clears checkedIds and hides bulk action buttons when fetchFiles fails (#2897)", async () => {
    useFilesPageStore.setState({
      files,
      total: files.length,
      selectedFileId: "image-file",
      checkedIds: new Set(["image-file"]),
      fetchFiles: initialState.fetchFiles,
    });
    apiListFiles.mockResolvedValueOnce({ files, total: files.length });
    render(<FileList />);

    expect(await screen.findByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    apiListFiles.mockRejectedValueOnce(new Error("Search failed"));
    await act(async () => {
      await useFilesPageStore.getState().fetchFiles();
    });

    expect(screen.getByText("Search failed")).toBeInTheDocument();
    expect(useFilesPageStore.getState().checkedIds.size).toBe(0);
    expect(useFilesPageStore.getState().selectedFileId).toBeNull();
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
    expect(screen.getByText("0 files")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });
});
