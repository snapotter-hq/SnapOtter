// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: vi.fn(),
    processing: false,
    error: null,
    downloadUrl: "/api/v1/download/JOB/invoice.txt",
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { PdfToTextSettings } from "@/components/tools/pdf-to-text-settings";
import { useFileStore } from "@/stores/file-store";

const pdf = () => new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" });

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/pdf/pdf-to-text"]}>
      <PdfToTextSettings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  useFileStore.getState().setFiles([pdf()]);
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
});

describe("PDF to Text says when some pages had no readable text (#954)", () => {
  it("names how many pages came out unreadable", () => {
    act(() =>
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        resultNotes: { unreadablePages: { count: 2, total: 5 } },
      }),
    );
    renderPanel();

    expect(screen.getByTestId("pdf-to-text-unreadable-pages")).toHaveTextContent(
      "2 of 5 pages have no readable text layer",
    );
  });

  it("names how many readable pages also held unreadable text (#4947)", () => {
    act(() =>
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        resultNotes: { partlyUnreadablePages: { count: 1, total: 3 } },
      }),
    );
    renderPanel();

    expect(screen.getByTestId("pdf-to-text-partly-unreadable-pages")).toHaveTextContent(
      "On 1 of 3 pages, some text is in a font",
    );
    expect(screen.queryByTestId("pdf-to-text-unreadable-pages")).not.toBeInTheDocument();
  });

  it("says nothing when every page read fine", () => {
    act(() => useFileStore.getState().updateEntry(0, { status: "completed", resultNotes: null }));
    renderPanel();

    expect(screen.queryByTestId("pdf-to-text-unreadable-pages")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pdf-to-text-partly-unreadable-pages")).not.toBeInTheDocument();
  });
});
