// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL: vi.fn(() => "blob:fake-url"),
  revokeObjectURL: vi.fn(),
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

import { LibrarySaveModeSelector } from "@/components/common/library-save-mode-selector";
import { useFileStore } from "@/stores/file-store";

function makeFile(name: string): File {
  return new File([new ArrayBuffer(64)], name, { type: "image/png" });
}

function stageLibraryFile() {
  useFileStore.getState().setFiles([makeFile("photo.png")]);
  useFileStore.getState().updateEntry(0, { serverFileId: "lib-1" });
}

describe("LibrarySaveModeSelector", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing when the selected file is not from the library", () => {
    useFileStore.getState().setFiles([makeFile("plain.png")]);
    const { container } = render(<LibrarySaveModeSelector toolId="resize" />);
    expect(container.innerHTML).toBe("");
  });

  it("shows both choices with 'save as new' selected by default", () => {
    stageLibraryFile();
    render(<LibrarySaveModeSelector toolId="resize" />);

    const saveAsNew = screen.getByRole("radio", { name: /save result as a new file/i });
    const overwrite = screen.getByRole("radio", { name: /overwrite the original/i });
    expect((saveAsNew as HTMLInputElement).checked).toBe(true);
    expect((overwrite as HTMLInputElement).checked).toBe(false);
  });

  it("updates the store when overwrite is chosen", () => {
    stageLibraryFile();
    render(<LibrarySaveModeSelector toolId="resize" />);

    fireEvent.click(screen.getByRole("radio", { name: /overwrite the original/i }));

    expect(useFileStore.getState().librarySaveMode).toBe("overwrite");
  });

  it("disables the choice while processing", () => {
    stageLibraryFile();
    useFileStore.getState().setProcessing(true);
    render(<LibrarySaveModeSelector toolId="resize" />);

    const saveAsNew = screen.getByRole("radio", { name: /save result as a new file/i });
    const overwrite = screen.getByRole("radio", { name: /overwrite the original/i });
    expect((saveAsNew as HTMLInputElement).disabled).toBe(true);
    expect((overwrite as HTMLInputElement).disabled).toBe(true);
  });

  it("renders nothing for tools that do not honor the save mode", () => {
    stageLibraryFile();
    const { container } = render(<LibrarySaveModeSelector toolId="watermark-image" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when multiple files would go through the batch path", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-1" });
    useFileStore.getState().updateEntry(1, { serverFileId: "lib-2" });

    const { container } = render(<LibrarySaveModeSelector toolId="compress" />);
    expect(container.innerHTML).toBe("");
  });

  it("still renders for multi-input tools that process all files in one run", () => {
    useFileStore.getState().setFiles([makeFile("a.pdf"), makeFile("b.pdf")]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-1" });

    render(<LibrarySaveModeSelector toolId="merge-pdf" />);
    expect(screen.getByRole("radio", { name: /save result as a new file/i })).toBeDefined();
  });
});
