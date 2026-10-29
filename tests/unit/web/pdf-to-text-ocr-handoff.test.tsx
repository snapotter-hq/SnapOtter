// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en, NO_TEXT_LAYER_CODE } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfToTextSettings } from "@/components/tools/pdf-to-text-settings";
import { useFileStore } from "@/stores/file-store";

const SCANNED_MESSAGE = "This PDF has no extractable text layer.";

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

  it("offers nothing for a batch, which reports failures per file", () => {
    useFileStore.getState().setFiles([pdf("a.pdf"), pdf("b.pdf")]);
    useFileStore.getState().setError(SCANNED_MESSAGE, NO_TEXT_LAYER_CODE);
    renderPanel();
    expect(screen.queryByTestId("pdf-to-text-run-ocr")).not.toBeInTheDocument();
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
