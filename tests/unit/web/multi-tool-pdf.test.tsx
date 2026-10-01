// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({
  processFiles: vi.fn(),
  processing: false,
  error: null,
  progress: { phase: "idle", percent: 0, elapsed: 0 },
}));
const getDocument = vi.hoisted(() => vi.fn());
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument }));
vi.mock("@/hooks/use-tool-processor", () => ({ useToolProcessor: () => processor }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn(), captureHandledError: vi.fn() }));
vi.mock("@/components/tools/document-view", () => ({
  DocumentView: () => <div>Document view</div>,
}));

import { PDF_MULTI_TOOL_LIMITS } from "@snapotter/shared";
import { MultiToolPdfCanvas } from "@/components/tools/multi-tool-pdf-canvas";
import { MultiToolPdfSettings } from "@/components/tools/multi-tool-pdf-settings";
import { captureHandledError } from "@/lib/analytics";
import { useFileStore } from "@/stores/file-store";
import { useMultiToolStore } from "@/stores/multi-tool-store";

function file(name: string) {
  const f = new File(["pdf"], name, { type: "application/pdf" });
  f.arrayBuffer = async () => new ArrayBuffer(1);
  return f;
}

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:pdf"), revokeObjectURL: vi.fn() }),
  );
  useFileStore.getState().reset();
  useMultiToolStore.getState().clear();
  processor.processFiles.mockClear();
  processor.processing = false;
  getDocument.mockReset();
  getDocument.mockImplementation(() => ({ promise: new Promise(() => {}), destroy: vi.fn() }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function editor() {
  return render(
    <>
      <MultiToolPdfCanvas />
      <MultiToolPdfSettings />
    </>,
  );
}
async function seedPrimary() {
  const primary = file("primary.pdf");
  useFileStore.getState().setFiles([primary]);
  const view = editor();
  await act(async () => {
    useMultiToolStore.getState().setPrimary(primary, 2);
  });
  return view;
}

describe("PDF multi-tool editor regressions", () => {
  it("retains the plan when the mobile settings sheet closes and reopens", async () => {
    const view = await seedPrimary();
    fireEvent.click(screen.getAllByRole("button", { name: "Rotate right" })[0]);
    const plan = useMultiToolStore.getState().plan;
    view.rerender(<MultiToolPdfCanvas />);
    expect(useMultiToolStore.getState().plan).toEqual(plan);
    view.rerender(
      <>
        <MultiToolPdfCanvas />
        <MultiToolPdfSettings />
      </>,
    );
    expect(screen.getByTestId("multi-tool-pdf-submit")).toBeEnabled();
    expect(useMultiToolStore.getState().plan).toEqual(plan);
  });

  it("can add another copy of a page already in the plan", async () => {
    await seedPrimary();
    fireEvent.click(screen.getByTestId("multi-tool-add-0-1"));
    expect(useMultiToolStore.getState().plan.map((p) => p.page)).toEqual([1, 2, 1]);
  });

  it("keeps canvas-added documents and their plan when the original is removed", async () => {
    const view = await seedPrimary();
    const extra = file("extra.pdf");
    fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [extra] },
    });
    act(() => {
      useMultiToolStore.getState().patchDoc(1, { pageCount: 1 });
      useMultiToolStore.getState().appendPage(1, 1, -1);
    });
    fireEvent.click(screen.getByTestId("multi-tool-remove-doc-0"));
    expect(useFileStore.getState().files).toEqual([extra]);
    expect(useMultiToolStore.getState().plan.map(({ doc, page }) => ({ doc, page }))).toEqual([
      { doc: 0, page: 1 },
    ]);
    expect(screen.getByTestId("multi-tool-pdf-submit")).toBeEnabled();
  });

  it("removes the clicked document when one File backs two of them", async () => {
    const shared = file("same.pdf");
    useFileStore.getState().setFiles([shared, shared]);
    editor();
    act(() => {
      useMultiToolStore.getState().setPrimary(shared, 1);
      useMultiToolStore.getState().patchDoc(1, { pageCount: 1 });
      useMultiToolStore.getState().appendPage(1, 1, -1);
    });
    const [first, second] = useMultiToolStore.getState().docs;
    expect(useMultiToolStore.getState().plan.map((p) => p.doc)).toEqual([0, 1]);

    fireEvent.click(screen.getByTestId("multi-tool-remove-doc-0"));

    expect(useMultiToolStore.getState().docs.map((d) => d.id)).toEqual([second.id]);
    expect(useMultiToolStore.getState().docs.map((d) => d.id)).not.toContain(first.id);
    expect(useMultiToolStore.getState().plan.map(({ doc, page }) => ({ doc, page }))).toEqual([
      { doc: 0, page: 1 },
    ]);
    expect(useFileStore.getState().files).toEqual([shared]);
  });

  it("renumbers later documents' pages when a middle document is removed", async () => {
    const [a, b, c] = [file("a.pdf"), file("b.pdf"), file("c.pdf")];
    useFileStore.getState().setFiles([a, b, c]);
    editor();
    act(() => {
      useMultiToolStore.getState().setPrimary(a, 1);
      useMultiToolStore.getState().patchDoc(1, { pageCount: 1 });
      useMultiToolStore.getState().patchDoc(2, { pageCount: 2 });
      useMultiToolStore.getState().appendPage(1, 1, -1);
      useMultiToolStore.getState().appendPage(2, 2, -1);
    });

    fireEvent.click(screen.getByTestId("multi-tool-remove-doc-1"));

    expect(useFileStore.getState().files).toEqual([a, c]);
    expect(useMultiToolStore.getState().docs.map((d) => d.file)).toEqual([a, c]);
    expect(useMultiToolStore.getState().plan.map(({ doc, page }) => ({ doc, page }))).toEqual([
      { doc: 0, page: 1 },
      { doc: 1, page: 2 },
    ]);
  });

  it("does not call a still-loading document fully in the plan", async () => {
    const view = await seedPrimary();
    fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file("loading.pdf")] },
    });
    expect(screen.queryAllByText("All in plan")).toHaveLength(1);
    const addAll = screen.getAllByText("Add all pages");
    expect(addAll).toHaveLength(1);
    expect(addAll[0]).toBeDisabled();
  });

  it("lets users remove an unreadable extra PDF and blocks invalid submission", async () => {
    const view = await seedPrimary();
    fireEvent.change(view.container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file("broken.pdf")] },
    });
    act(() => useMultiToolStore.getState().patchDoc(1, { failed: true }));
    expect(screen.getByTestId("multi-tool-pdf-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("multi-tool-remove-doc-1"));
    expect(screen.getByTestId("multi-tool-pdf-submit")).toBeEnabled();
  });

  it("reports and marks a document that fails to open, not just a page that fails to render", async () => {
    getDocument.mockImplementationOnce(() => ({
      promise: Promise.reject(new Error("bad xref")),
      destroy: vi.fn(),
    }));
    useFileStore.getState().setFiles([file("broken.pdf")]);
    editor();
    await waitFor(() => expect(useMultiToolStore.getState().docs[0]?.failed).toBe(true));
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
  });

  it("keeps restart and remove controls available when the primary PDF fails", async () => {
    await seedPrimary();
    act(() => useMultiToolStore.getState().patchDoc(0, { pageCount: 0, failed: true }));
    expect(screen.getByTestId("multi-tool-remove-doc-0")).toBeEnabled();
    fireEvent.click(screen.getByTestId("multi-tool-new-file"));
    expect(useFileStore.getState().files).toHaveLength(0);
  });

  it("does not flush a removed document's pending thumbnail into the next document", async () => {
    const a = file("a.pdf");
    const b = file("b.pdf");
    getDocument.mockImplementationOnce(() => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 140, height: 186 }),
          render: () => ({ promise: Promise.resolve() }),
          cleanup: vi.fn(),
        }),
      }),
      destroy: vi.fn(),
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,removed",
    );
    useFileStore.getState().setFiles([a, b]);
    editor();
    await waitFor(() => expect(useMultiToolStore.getState().docs[0]?.pageCount).toBe(1));
    fireEvent.click(screen.getByTestId("multi-tool-remove-doc-0"));
    expect(useMultiToolStore.getState().docs[0].thumbs).toEqual({});
  });

  it("resumes missing thumbnails after returning from the result without resetting edits", async () => {
    const primary = file("primary.pdf");
    useFileStore.getState().setFiles([primary]);
    useMultiToolStore.getState().syncFiles([primary]);
    useMultiToolStore.getState().setPrimary(primary, 2);
    useMultiToolStore.getState().patchDoc(0, { thumbs: { 1: "data:image/jpeg;base64,first" } });
    const id = useMultiToolStore.getState().plan[0].id;
    useMultiToolStore.getState().rotatePage(id, 90);
    const plan = useMultiToolStore.getState().plan;
    const getPage = vi.fn(async () => ({
      getViewport: () => ({ width: 140, height: 186 }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    }));
    const destroy = vi.fn();
    getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage }), destroy });
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/jpeg;base64,second",
    );
    render(<MultiToolPdfCanvas />);
    await waitFor(() => expect(useMultiToolStore.getState().docs[0].thumbs[2]).toBeDefined());
    expect(getPage.mock.calls).toEqual([[2]]);
    expect(useMultiToolStore.getState().plan).toEqual(plan);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("preserves extra pages added before the primary PDF finishes loading", async () => {
    const a = file("a.pdf");
    const b = file("b.pdf");
    useFileStore.getState().setFiles([a, b]);
    editor();
    act(() => {
      useMultiToolStore.getState().patchDoc(1, { pageCount: 2 });
      useMultiToolStore.getState().appendPage(1, 2, -1);
      useMultiToolStore.getState().setPrimary(a, 1);
    });
    expect(useMultiToolStore.getState().plan.map(({ doc, page }) => ({ doc, page }))).toEqual([
      { doc: 0, page: 1 },
      { doc: 1, page: 2 },
    ]);
  });

  it("can reset the plan after removing every page", async () => {
    await seedPrimary();
    for (const button of screen.getAllByRole("button", { name: "Remove page" }))
      fireEvent.click(button);
    expect(useMultiToolStore.getState().plan).toHaveLength(0);
    fireEvent.click(screen.getByTestId("multi-tool-reset"));
    expect(useMultiToolStore.getState().plan.map((p) => p.page)).toEqual([1, 2]);
  });

  it("swaps both preview dimensions on quarter turns so pages are not clipped", async () => {
    await seedPrimary();
    const tile = screen.getByTestId("multi-tool-page-0");
    fireEvent.click(screen.getAllByRole("button", { name: "Rotate right" })[0]);
    expect(tile.firstElementChild).toHaveStyle({ width: "186px", height: "140px" });
  });

  it("caps the natural plan at the output page limit", () => {
    const primary = file("primary.pdf");
    useFileStore.getState().setFiles([primary]);
    useMultiToolStore.getState().syncFiles([primary]);
    useMultiToolStore.getState().setPrimary(primary, PDF_MULTI_TOOL_LIMITS.outputPages + 1);
    expect(useMultiToolStore.getState().plan).toHaveLength(PDF_MULTI_TOOL_LIMITS.outputPages);
    render(<MultiToolPdfSettings />);
    expect(screen.getByTestId("multi-tool-pdf-submit")).toBeEnabled();
    expect(
      screen.getByText(
        `Maximum ${PDF_MULTI_TOOL_LIMITS.documents} PDFs and ${PDF_MULTI_TOOL_LIMITS.outputPages} output pages.`,
      ),
    ).toBeVisible();
  });

  it("refuses to grow the plan past the output page limit", () => {
    const primary = file("primary.pdf");
    useFileStore.getState().setFiles([primary]);
    useMultiToolStore.getState().syncFiles([primary]);
    useMultiToolStore.getState().setPrimary(primary, 2);
    const { appendPage, appendDoc } = useMultiToolStore.getState();
    for (let i = 0; i < PDF_MULTI_TOOL_LIMITS.outputPages; i++) appendPage(0, 1, -1);
    expect(useMultiToolStore.getState().plan).toHaveLength(PDF_MULTI_TOOL_LIMITS.outputPages);
    appendDoc(0);
    expect(useMultiToolStore.getState().plan).toHaveLength(PDF_MULTI_TOOL_LIMITS.outputPages);
  });

  it("blocks too many documents locally and permits the maximum", () => {
    const files = Array.from({ length: 21 }, (_, i) => file(`${i}.pdf`));
    useFileStore.getState().setFiles(files);
    useMultiToolStore.getState().syncFiles(files);
    useMultiToolStore.getState().setPrimary(files[0], 1);
    files.forEach((_, i) => {
      useMultiToolStore.getState().patchDoc(i, { pageCount: 1 });
    });
    render(<MultiToolPdfSettings />);
    expect(screen.getByTestId("multi-tool-pdf-submit")).toBeDisabled();
    act(() => {
      useFileStore.getState().removeFile(20);
      useMultiToolStore.getState().syncFiles(useFileStore.getState().files);
    });
    expect(screen.getByTestId("multi-tool-pdf-submit")).toBeEnabled();
  });

  it("skips non-PDF picks and clamps canvas adds to the document limit", async () => {
    const view = await seedPrimary();
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const notes = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [notes, file("extra.pdf")] } });
    expect(useFileStore.getState().files.map((f) => f.name)).toEqual(["primary.pdf", "extra.pdf"]);

    const fill = Array.from(
      { length: PDF_MULTI_TOOL_LIMITS.documents - useFileStore.getState().files.length },
      (_, i) => file(`fill-${i}.pdf`),
    );
    act(() => useFileStore.getState().addFiles(fill));
    expect(useFileStore.getState().files).toHaveLength(PDF_MULTI_TOOL_LIMITS.documents);
    fireEvent.change(input, { target: { files: [file("one-more.pdf")] } });
    expect(useFileStore.getState().files).toHaveLength(PDF_MULTI_TOOL_LIMITS.documents);
    expect(screen.getByTestId("multi-tool-add-doc")).toBeDisabled();
  });

  it("says how many picked files were skipped and why", async () => {
    const view = await seedPrimary();
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(screen.queryByTestId("multi-tool-skipped")).toBeNull();

    const notes = new File(["x"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [notes, file("extra.pdf")] } });
    expect(screen.getByTestId("multi-tool-skipped")).toHaveTextContent(
      "1 file(s) skipped: only PDFs can be added.",
    );

    const room = PDF_MULTI_TOOL_LIMITS.documents - useFileStore.getState().files.length;
    const picked = Array.from({ length: room + 3 }, (_, i) => file(`more-${i}.pdf`));
    fireEvent.change(input, { target: { files: picked } });
    expect(useFileStore.getState().files).toHaveLength(PDF_MULTI_TOOL_LIMITS.documents);
    const notice = screen.getByTestId("multi-tool-skipped");
    expect(notice).toHaveTextContent(
      `3 PDF(s) not added: the editor holds up to ${PDF_MULTI_TOOL_LIMITS.documents} PDFs.`,
    );
    expect(notice).not.toHaveTextContent("only PDFs");
  });

  it("submits duplicate rotations with the surviving upload order", async () => {
    await seedPrimary();
    fireEvent.click(screen.getByTestId("multi-tool-add-0-1"));
    fireEvent.click(screen.getAllByRole("button", { name: "Rotate right" })[2]);
    fireEvent.click(screen.getByTestId("multi-tool-pdf-submit"));
    expect(processor.processFiles).toHaveBeenCalledWith(useFileStore.getState().files, {
      pageCounts: [2],
      items: [
        { doc: 0, page: 1 },
        { doc: 0, page: 2 },
        { doc: 0, page: 1, rot: 90 },
      ],
    });
  });
});
