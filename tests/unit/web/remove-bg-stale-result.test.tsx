// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 1 (background removal) has finished for one file: the processor
// exposes the mask's download URL, so the page shows its download controls.
vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: vi.fn(),
    processing: false,
    error: null,
    downloadUrl: "/api/v1/download/JOBA/a_mask.png",
    originalSize: 1000,
    processedSize: 500,
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { RemoveBgSettings } from "@/components/tools/remove-bg-settings";
import { useFileStore } from "@/stores/file-store";

const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
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
    act(() => useFileStore.getState().setFiles([a, png("b.png")]));
    act(() => useFileStore.getState().setFiles([png("b.png")]));

    expect(screen.queryByTestId("remove-background-download")).not.toBeInTheDocument();
    expect(screen.queryByTestId("remove-background-download-effects")).not.toBeInTheDocument();
  });

  it("keeps the finished result while the same file stays loaded", async () => {
    const a = png("a.png");
    useFileStore.getState().setFiles([a]);
    render(<RemoveBgSettings />);
    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();

    // A store update that keeps the same file (a re-set of the same list).
    act(() => useFileStore.getState().setFiles([a]));

    expect(screen.getByTestId("remove-background-download")).toBeInTheDocument();
  });
});
