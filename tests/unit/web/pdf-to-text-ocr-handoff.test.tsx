// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en, NO_TEXT_LAYER_CODE } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfToTextSettings } from "@/components/tools/pdf-to-text-settings";
import { useFileStore } from "@/stores/file-store";

const SCANNED_MESSAGE = "This PDF has no extractable text layer.";
const UNREADABLE_MESSAGE =
  "This PDF has a text layer, but its fonts don't map to readable characters.";

function pdf(name: string): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </output>
  );
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/pdf/pdf-to-text"]}>
      <PdfToTextSettings />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => {} }),
  );
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.getState().reset();
});

describe("pdf-to-text OCR handoff (#1164)", () => {
  it("shows a hint that doesn't call an unreadable-font PDF scanned (#4951)", () => {
    useFileStore.getState().setFiles([pdf("glyph-ids.pdf")]);
    useFileStore.getState().setError(UNREADABLE_MESSAGE, NO_TEXT_LAYER_CODE);
    renderPanel();

    const hint = en.toolSettings["pdf-to-text"].scannedHint;
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(hint).not.toMatch(/scan/i);
  });

  it("offers OCR when the server says the PDF has no text layer", () => {
    useFileStore.getState().setFiles([pdf("scan.pdf")]);
    useFileStore.getState().setError(SCANNED_MESSAGE, NO_TEXT_LAYER_CODE);
    renderPanel();

    expect(screen.getByTestId("pdf-to-text-run-ocr")).toHaveTextContent(
      en.toolSettings["pdf-to-text"].runOcr,
    );
    expect(screen.getByText(en.toolSettings["pdf-to-text"].scannedHint)).toBeInTheDocument();
  });

  it("offers nothing for other failures, even with a similar message", () => {
    useFileStore.getState().setFiles([pdf("broken.pdf")]);
    useFileStore.getState().setError(SCANNED_MESSAGE, "SOMETHING_ELSE");
    renderPanel();
    expect(screen.queryByTestId("pdf-to-text-run-ocr")).not.toBeInTheDocument();

    act(() => useFileStore.getState().setError(SCANNED_MESSAGE));
    expect(screen.queryByTestId("pdf-to-text-run-ocr")).not.toBeInTheDocument();
  });

  it("offers OCR for a batch the server flagged as all scanned (#4143)", () => {
    useFileStore.getState().setFiles([pdf("a.pdf"), pdf("b.pdf")]);
    useFileStore.getState().setError(SCANNED_MESSAGE, NO_TEXT_LAYER_CODE);
    renderPanel();
    expect(screen.getByTestId("pdf-to-text-run-ocr")).toBeInTheDocument();
  });

  it("carries the loaded file into the OCR tool and clears the failure", () => {
    useFileStore.getState().setFiles([pdf("scan.pdf")]);
    const [entry] = useFileStore.getState().entries;
    useFileStore.getState().updateEntryById(entry.id, { status: "failed", error: SCANNED_MESSAGE });
    useFileStore.getState().setError(SCANNED_MESSAGE, NO_TEXT_LAYER_CODE);
    renderPanel();

    fireEvent.click(screen.getByTestId("pdf-to-text-run-ocr"));

    expect(screen.getByTestId("location")).toHaveTextContent('/pdf/ocr-pdf|{"fromLibrary":true}');
    const state = useFileStore.getState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].file.name).toBe("scan.pdf");
    expect(state.entries[0].status).toBe("pending");
    expect(state.entries[0].error).toBeNull();
    expect(state.error).toBeNull();
    expect(state.errorCode).toBeNull();
  });
});

describe("pdf-to-text OCR handoff after a run with unreadable pages (#5150)", () => {
  const unreadable = { unreadablePages: { count: 2, total: 5 } };

  it("offers OCR under the unreadable-pages note on a successful run", () => {
    useFileStore.getState().setFiles([pdf("mixed.pdf")]);
    act(() =>
      useFileStore.getState().updateEntry(0, { status: "completed", resultNotes: unreadable }),
    );
    renderPanel();

    expect(screen.getByTestId("pdf-to-text-unreadable-pages")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-to-text-run-ocr-unreadable")).toHaveTextContent(
      en.toolSettings["pdf-to-text"].runOcr,
    );
    expect(screen.queryByTestId("pdf-to-text-run-ocr")).not.toBeInTheDocument();
  });

  it("offers OCR once under the partly-unreadable note (#4947)", () => {
    useFileStore.getState().setFiles([pdf("odd-font.pdf")]);
    act(() =>
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        resultNotes: { partlyUnreadablePages: { count: 1, total: 3 } },
      }),
    );
    renderPanel();

    expect(screen.getByTestId("pdf-to-text-partly-unreadable-pages")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-to-text-unreadable-pages")).not.toBeInTheDocument();
    expect(screen.getByTestId("pdf-to-text-run-ocr-unreadable")).toBeInTheDocument();
  });

  it("shows a single OCR button when a file has both notes", () => {
    useFileStore.getState().setFiles([pdf("both.pdf")]);
    act(() =>
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        resultNotes: {
          unreadablePages: { count: 1, total: 4 },
          partlyUnreadablePages: { count: 2, total: 4 },
        },
      }),
    );
    renderPanel();

    expect(screen.getAllByTestId("pdf-to-text-run-ocr-unreadable")).toHaveLength(1);
  });

  it("hands off a file flagged only as partly unreadable", () => {
    useFileStore.getState().setFiles([pdf("clean.pdf"), pdf("odd-font.pdf")]);
    act(() => {
      const store = useFileStore.getState();
      store.updateEntry(0, { status: "completed", resultNotes: null });
      store.updateEntry(1, {
        status: "completed",
        resultNotes: { partlyUnreadablePages: { count: 1, total: 3 } },
      });
      store.setSelectedIndex(1);
    });
    renderPanel();

    fireEvent.click(screen.getByTestId("pdf-to-text-run-ocr-unreadable"));

    expect(useFileStore.getState().entries.map((entry) => entry.file.name)).toEqual([
      "odd-font.pdf",
    ]);
  });

  it("offers nothing when every page read fine", () => {
    useFileStore.getState().setFiles([pdf("clean.pdf")]);
    act(() => useFileStore.getState().updateEntry(0, { status: "completed", resultNotes: null }));
    renderPanel();

    expect(screen.queryByTestId("pdf-to-text-run-ocr-unreadable")).not.toBeInTheDocument();
  });

  it("hands off only the files with unreadable pages, keeping readable ones out of OCR", () => {
    useFileStore.getState().setFiles([pdf("clean.pdf"), pdf("mixed.pdf"), pdf("also-mixed.pdf")]);
    act(() => {
      const store = useFileStore.getState();
      const result = (name: string) => ({
        status: "completed" as const,
        processedUrl: `blob:${name}`,
        processedFilename: name,
        processedSize: 12,
      });
      store.updateEntry(0, { ...result("clean.txt"), resultNotes: null });
      store.updateEntry(1, { ...result("mixed.txt"), resultNotes: unreadable });
      store.updateEntry(2, { ...result("also-mixed.txt"), resultNotes: unreadable });
      store.setBatchZip(new Blob(["zip"]), "pdf-to-text.zip");
      store.setSelectedIndex(2);
    });
    renderPanel();

    fireEvent.click(screen.getByTestId("pdf-to-text-run-ocr-unreadable"));

    expect(screen.getByTestId("location")).toHaveTextContent('/pdf/ocr-pdf|{"fromLibrary":true}');
    const state = useFileStore.getState();
    expect(state.entries.map((entry) => entry.file.name)).toEqual(["mixed.pdf", "also-mixed.pdf"]);
    expect(state.currentEntry?.file.name).toBe("also-mixed.pdf");
    // The .txt from this run must not show up on the OCR page as its result.
    for (const entry of state.entries) {
      expect(entry.status).toBe("pending");
      expect(entry.error).toBeNull();
      expect(entry.processedUrl).toBeNull();
      expect(entry.processedFilename).toBeNull();
      expect(entry.resultNotes).toBeNull();
      expect(entry.claimed).toBe(false);
    }
    expect(state.batchZipBlob).toBeNull();
  });

  it("clears the run's result even when every file had unreadable pages", () => {
    useFileStore.getState().setFiles([pdf("mixed.pdf")]);
    act(() => {
      const store = useFileStore.getState();
      store.updateEntry(0, {
        status: "completed",
        processedUrl: "blob:mixed.txt",
        processedFilename: "mixed.txt",
        processedSize: 12,
        resultNotes: unreadable,
      });
    });
    renderPanel();

    fireEvent.click(screen.getByTestId("pdf-to-text-run-ocr-unreadable"));

    const [entry] = useFileStore.getState().entries;
    expect(entry.file.name).toBe("mixed.pdf");
    expect(entry.status).toBe("pending");
    expect(entry.processedUrl).toBeNull();
    expect(entry.resultNotes).toBeNull();
  });
});
