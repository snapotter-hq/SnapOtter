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

import { CompressControls, CompressResizeNote } from "@/components/tools/compress-settings";
import { type ResultNotes, useFileStore } from "@/stores/file-store";

afterEach(cleanup);

describe("CompressControls target size units (#1272)", () => {
  it("sends 1 MB as 1000 KB, matching the server's decimal KB", () => {
    const onChange = vi.fn();
    render(<CompressControls onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Target Size"), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "MB" } });

    expect(onChange).toHaveBeenLastCalledWith({ mode: "targetSize", targetSizeKb: 2000 });
  });
});

// The note reads the selected file's own result (#1292): a batch settles each
// entry with its notes, and the panel adds a summary across the batch.
describe("CompressResizeNote (#1272, #1292)", () => {
  function stageResults(notes: Array<ResultNotes | null>, selected = 0) {
    const files = notes.map(
      (_, i) => new File([new ArrayBuffer(8)], `f${i}.jpg`, { type: "image/jpeg" }),
    );
    useFileStore.getState().setFiles(files);
    notes.forEach((resultNotes, i) => {
      useFileStore.getState().updateEntry(i, {
        status: "completed",
        processedUrl: `blob:result-${i}`,
        resultNotes,
      });
    });
    useFileStore.getState().setSelectedIndex(selected);
  }

  beforeEach(() => {
    useFileStore.getState().reset();
  });

  it("says the image was shrunk, to what, and for which target", () => {
    stageResults([{ targetKb: 20, resizedTo: { width: 400, height: 300 } }]);
    render(<CompressResizeNote />);

    expect(screen.getByText("Resized to 400 × 300 to fit 20 KB")).toBeTruthy();
    expect(screen.queryByText(/of 1 images/)).toBeNull();
  });

  it("stays silent when quality alone reached the target", () => {
    stageResults([{ targetKb: 20 }]);
    const { container } = render(<CompressResizeNote />);

    expect(container.textContent).toBe("");
  });

  it("stays silent without a result", () => {
    useFileStore
      .getState()
      .setFiles([new File([new ArrayBuffer(8)], "a.jpg", { type: "image/jpeg" })]);
    const { container } = render(<CompressResizeNote />);

    expect(container.textContent).toBe("");
  });

  it("sums up a batch and speaks for the selected file", () => {
    const resized = { targetKb: 20, resizedTo: { width: 800, height: 600 } };
    stageResults(
      [{ targetKb: 20 }, resized, { targetKb: 20, resizedTo: { width: 640, height: 480 } }],
      1,
    );
    render(<CompressResizeNote />);

    expect(screen.getByText("2 of 3 images were scaled down to fit 20 KB.")).toBeTruthy();
    expect(screen.getByText("Resized to 800 × 600 to fit 20 KB")).toBeTruthy();
  });

  it("keeps the batch summary but no per-file line for a file that fit", () => {
    stageResults([{ targetKb: 20 }, { targetKb: 20, resizedTo: { width: 800, height: 600 } }], 0);
    render(<CompressResizeNote />);

    expect(screen.getByText("1 of 2 images were scaled down to fit 20 KB.")).toBeTruthy();
    expect(screen.queryByText(/Resized to/)).toBeNull();
  });
});
