// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = {
  processFiles: vi.fn(),
  processAllFiles: vi.fn(),
  processing: false,
  error: null,
  progress: { phase: "idle", stage: null, percent: 0, elapsed: 0 },
  resultPayload: null as Record<string, unknown> | null,
};

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => processor,
}));

import { CompressPdfPresetSettings } from "@/components/tools/compress-pdf-preset-settings";
import { useFileStore } from "@/stores/file-store";

function renderPreset(toolId: string) {
  return render(
    <MemoryRouter initialEntries={[`/pdf/${toolId}`]}>
      <Routes>
        <Route path="/:section/:toolId" element={<CompressPdfPresetSettings />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The file on screen: processed to `size` bytes, or not processed yet. */
function selectFile(entry: { status: "pending" | "completed"; processedSize: number | null }) {
  useFileStore.setState({
    files: [new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" })],
    currentEntry: entry,
  } as never);
}

beforeEach(() => {
  processor.resultPayload = null;
  processor.processFiles.mockClear();
  processor.processAllFiles.mockClear();
  selectFile({ status: "pending", processedSize: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// #1070: the preset locks compress-pdf's target and must still say when a
// mostly-text PDF can't get under it, instead of handing back a bigger file silently.
describe("compress-pdf-to-N preset panel", () => {
  it("shows the locked target and submits no settings", () => {
    renderPreset("compress-pdf-to-1mb");
    expect(screen.getByText("1 MB")).toBeTruthy();
    fireEvent.click(screen.getByTestId("compress-pdf-preset-submit"));
    expect(processor.processFiles).toHaveBeenCalledWith(expect.any(Array), {});
  });

  it("says so when the target was missed", () => {
    processor.resultPayload = { targetKb: 100, targetMet: false };
    selectFile({ status: "completed", processedSize: 140_200 });
    renderPreset("compress-pdf-to-100kb");
    expect(screen.getByText(/Couldn't reach 100 KB/)).toBeTruthy();
    expect(screen.getByText(/140\.2 KB/)).toBeTruthy();
  });

  it("confirms when the target was reached", () => {
    processor.resultPayload = { targetKb: 500, targetMet: true };
    selectFile({ status: "completed", processedSize: 480_000 });
    renderPreset("compress-pdf-to-500kb");
    expect(screen.getByText(/Reached your 500 KB target/)).toBeTruthy();
  });

  it("reports an MB target's result in MB", () => {
    processor.resultPayload = { targetKb: 1000, targetMet: false };
    selectFile({ status: "completed", processedSize: 1_049_673 });
    renderPreset("compress-pdf-to-1mb");
    expect(screen.getByText(/Couldn't reach 1 MB\. Smallest achievable was 1\.05 MB/)).toBeTruthy();
    expect(screen.queryByText(/KB/)).toBeNull();
  });

  it("stays quiet when the file on screen hasn't been processed", () => {
    // A result left over from another preset or an earlier upload.
    processor.resultPayload = { targetKb: 100, targetMet: false };
    selectFile({ status: "pending", processedSize: null });
    renderPreset("compress-pdf-to-1mb");
    expect(screen.queryByText(/Couldn't reach/)).toBeNull();
    expect(screen.queryByText(/Reached your/)).toBeNull();
  });

  it("labels a multi-file run as a batch", () => {
    useFileStore.setState({
      files: [
        new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" }),
        new File([new Uint8Array(10)], "b.pdf", { type: "application/pdf" }),
      ],
    } as never);
    renderPreset("compress-pdf-to-200kb");
    const submit = screen.getByTestId("compress-pdf-preset-submit");
    expect(submit.textContent).toMatch(/2 files/);
    fireEvent.click(submit);
    expect(processor.processAllFiles).toHaveBeenCalledWith(expect.any(Array), {});
  });

  it("refuses to render for a tool that isn't a PDF preset", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderPreset("compress-image-to-100kb")).toThrow(/No PDF compress preset/);
  });
});
