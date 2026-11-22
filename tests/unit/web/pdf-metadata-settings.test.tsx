// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = {
  processFiles: vi.fn(),
  processAllFiles: vi.fn(),
  processing: false,
  error: null,
  progress: { phase: "idle", stage: null, percent: 0, elapsed: 0 },
};

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => processor,
}));

import { PdfMetadataControls, PdfMetadataSettings } from "@/components/tools/pdf-metadata-settings";
import { useFileStore } from "@/stores/file-store";

function checkbox(testId: string): HTMLInputElement {
  return screen.getByTestId(testId) as HTMLInputElement;
}

beforeEach(() => {
  processor.processFiles.mockClear();
  useFileStore.setState({
    files: [new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" })],
  } as never);
});

afterEach(() => {
  cleanup();
});

// #5182: removing attachments is opt-in and only offered with "Remove document metadata".
describe("pdf-metadata remove attachments option", () => {
  it("stays disabled until stripAll is on, then sends removeAttachments", () => {
    render(<PdfMetadataSettings />);
    expect(checkbox("pdf-metadata-remove-attachments").disabled).toBe(true);

    fireEvent.click(checkbox("pdf-metadata-strip-all"));
    expect(checkbox("pdf-metadata-remove-attachments").disabled).toBe(false);
    fireEvent.click(checkbox("pdf-metadata-remove-attachments"));
    fireEvent.click(screen.getByTestId("pdf-metadata-submit"));

    expect(processor.processFiles).toHaveBeenCalledWith(expect.any(Array), {
      stripAll: true,
      removeAttachments: true,
    });
  });

  it("drops removeAttachments when stripAll is turned back off", () => {
    render(<PdfMetadataSettings />);
    fireEvent.click(checkbox("pdf-metadata-strip-all"));
    fireEvent.click(checkbox("pdf-metadata-remove-attachments"));
    fireEvent.click(checkbox("pdf-metadata-strip-all"));

    expect(checkbox("pdf-metadata-remove-attachments").checked).toBe(false);
    fireEvent.click(checkbox("pdf-metadata-strip-all"));
    expect(checkbox("pdf-metadata-remove-attachments").checked).toBe(false);
    fireEvent.click(checkbox("pdf-metadata-strip-all"));
    fireEvent.click(screen.getByTestId("pdf-metadata-submit"));
    expect(processor.processFiles).toHaveBeenCalledWith(expect.any(Array), {});
  });

  it("restores a saved pipeline step and reports removeAttachments only with stripAll", () => {
    const onChange = vi.fn();
    render(
      <PdfMetadataControls
        settings={{ stripAll: true, removeAttachments: true }}
        onChange={onChange}
      />,
    );
    expect(checkbox("pdf-metadata-controls-remove-attachments").checked).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({ stripAll: true, removeAttachments: true });

    fireEvent.click(checkbox("pdf-metadata-controls-strip-all"));
    expect(checkbox("pdf-metadata-controls-remove-attachments").disabled).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({});
  });
});
