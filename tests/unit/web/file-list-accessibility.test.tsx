// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
