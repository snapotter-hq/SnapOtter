// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The processor's state as the page sees it. By default Phase 1 (background
// removal) has finished for the loaded file and exposes the mask's URL; a test
// can start from a run still in flight and finish it later.
const processor = vi.hoisted(() => ({
  processing: false,
  downloadUrl: "/api/v1/download/JOBA/a_mask.png" as string | null,
}));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
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
  processor.processing = false;
  processor.downloadUrl = "/api/v1/download/JOBA/a_mask.png";
});

afterEach(() => {
  cleanup();
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
});
