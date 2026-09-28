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

type Entry = {
  status: "pending" | "completed";
  processedSize: number | null;
  resultNotes?: { targetKb?: number; targetMet?: boolean } | null;
};

/** The file on screen: processed to `size` bytes, or not processed yet. */
function selectFile(entry: Entry) {
  const full = { resultNotes: null, ...entry };
  useFileStore.setState({
    files: [new File([new Uint8Array(10)], "a.pdf", { type: "application/pdf" })],
    entries: [full],
    currentEntry: full,
  } as never);
}

beforeEach(() => {
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
    selectFile({
      status: "completed",
      processedSize: 140_200,
      resultNotes: { targetKb: 100, targetMet: false },
    });
    renderPreset("compress-pdf-to-100kb");
    expect(screen.getByText(/Couldn't reach 100 KB/)).toBeTruthy();
    expect(screen.getByText(/140\.2 KB/)).toBeTruthy();
  });

  it("confirms when the target was reached", () => {
    selectFile({
      status: "completed",
      processedSize: 480_000,
      resultNotes: { targetKb: 500, targetMet: true },
    });
    renderPreset("compress-pdf-to-500kb");
    expect(screen.getByText(/Reached your 500 KB target/)).toBeTruthy();
  });

  it("reports an MB target's result in MB", () => {
    selectFile({
      status: "completed",
      processedSize: 1_049_673,
      resultNotes: { targetKb: 1000, targetMet: false },
    });
    renderPreset("compress-pdf-to-1mb");
    expect(screen.getByText(/Couldn't reach 1 MB\. Smallest achievable was 1\.05 MB/)).toBeTruthy();
    expect(screen.queryByText(/KB/)).toBeNull();
  });

  it("stays quiet when the file on screen hasn't been processed", () => {
    // Notes left over from an earlier run on a file that's pending again.
    selectFile({
      status: "pending",
      processedSize: null,
      resultNotes: { targetKb: 100, targetMet: false },
    });
    renderPreset("compress-pdf-to-1mb");
    expect(screen.queryByText(/Couldn't reach/)).toBeNull();
    expect(screen.queryByText(/Reached your/)).toBeNull();
  });

  // #1292: a batch reports each file's verdict, so the panel can say how many
  // missed and the verdict follows whichever file is selected.
  it("sums up a batch's misses and gives the selected file's verdict", () => {
    const pdf = (name: string) => new File([new Uint8Array(10)], name, { type: "application/pdf" });
    const entries = [
      {
        status: "completed",
        processedSize: 90_000,
        resultNotes: { targetKb: 100, targetMet: true },
      },
      {
        status: "completed",
        processedSize: 184_000,
        resultNotes: { targetKb: 100, targetMet: false },
      },
      {
        status: "completed",
        processedSize: 240_000,
        resultNotes: { targetKb: 100, targetMet: false },
      },
    ];
    useFileStore.setState({
      files: [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")],
      entries,
      currentEntry: entries[1],
    } as never);
    renderPreset("compress-pdf-to-100kb");

    expect(screen.getByText("2 of 3 files didn't get under 100 KB.")).toBeTruthy();
    expect(screen.getByText(/Couldn't reach 100 KB\. Smallest achievable was 184 KB/)).toBeTruthy();
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
