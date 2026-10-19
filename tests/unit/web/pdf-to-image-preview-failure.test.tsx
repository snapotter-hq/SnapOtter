// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { PdfToImageSettings } from "@/components/tools/pdf-to-image-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { ToolPage } from "@/pages/tool-page";
import { useFileStore } from "@/stores/file-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";

/**
 * A failed preview used to clear the store's file, so the panel's effect saw
 * the selected file differ from it again and asked for the preview once more,
 * on every render, with no limit (#1954). The store now keeps the file, asks
 * once, and leaves the error on screen; only the newest request writes its
 * outcome, so a late answer for a file the viewer left can't land on the next.
 */

/** Stop answering after this many requests, so a regression ends instead of spinning. */
const ANSWER_CAP = 20;

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

/** The file name and AbortSignal of every preview request, in order. */
let asked: string[] = [];
let previewSignals: Array<AbortSignal | undefined> = [];

function failed(message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status: 422 });
}

function pages(count: number): Response {
  return new Response(JSON.stringify({ pageCount: count, thumbnails: [] }));
}

/** Answers each preview with `answer(fileName)`, up to ANSWER_CAP requests. */
function previewServer(answer: (name: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v1/config/auth")) {
      return new Response(JSON.stringify({ authEnabled: false }), { status: 200 });
    }
    if (!url.includes("/preview")) throw new Error(`unexpected request: ${input}`);
    const body = init?.body;
    if (!(body instanceof FormData)) throw new Error("preview sent without a form body");
    const name = (body.get("file") as File).name;
    asked.push(name);
    previewSignals.push(init?.signal ?? undefined);
    if (asked.length > ANSWER_CAP) return new Promise<Response>(() => {});
    return answer(name);
  });
}

function pdf(name = "doc.pdf", type = "application/pdf"): File {
  return new File(["%PDF"], name, { type });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

/** Lets the effect, the request, and any re-render it causes run for a while. */
async function settle(ms = 500): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, ms)));
}

beforeEach(() => {
  asked = [];
  previewSignals = [];
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
  vi.stubGlobal(
    "fetch",
    previewServer(() => failed("Bad PDF")),
  );
  usePdfToImageStore.getState().reset();
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  usePdfToImageStore.getState().reset();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pdf-to-image panel: a failed preview", () => {
  it("asks for the preview once and keeps the error on screen", async () => {
    useFileStore.getState().setFiles([pdf()]);
    render(<PdfToImageSettings />, { wrapper });
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    await settle();

    expect(asked).toEqual(["doc.pdf"]);
    expect(screen.getByText("Bad PDF")).toBeInTheDocument();
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    expect(usePdfToImageStore.getState().loadingPreview).toBe(false);
    expect(screen.getByTestId("pdf-to-image-submit")).toBeDisabled();
  });

  it("asks again when the viewer picks a different file", async () => {
    useFileStore.getState().setFiles([pdf("first.pdf")]);
    render(<PdfToImageSettings />, { wrapper });
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    await settle();
    expect(asked).toEqual(["first.pdf"]);

    act(() => useFileStore.getState().setFiles([pdf("second.pdf")]));
    await waitFor(() => expect(asked.length).toBe(2));
    await settle();

    expect(asked).toEqual(["first.pdf", "second.pdf"]);
    expect(screen.getByText("Bad PDF")).toBeInTheDocument();
  });

  it("asks again when the store is reset under the panel, as a tool switch does", async () => {
    vi.stubGlobal(
      "fetch",
      previewServer(() => pages(3)),
    );
    useFileStore.getState().setFiles([pdf()]);
    render(<PdfToImageSettings />, { wrapper });
    await waitFor(() => expect(asked.length).toBe(1));

    act(() => usePdfToImageStore.getState().reset());
    await waitFor(() => expect(asked.length).toBe(2));
    await settle();

    expect(asked).toEqual(["doc.pdf", "doc.pdf"]);
    const state = usePdfToImageStore.getState();
    expect(state.file?.name).toBe("doc.pdf");
    expect(state.pageCount).toBe(3);
    expect(screen.getByTestId("pdf-to-image-submit")).toBeEnabled();
  });

  it("ignores a late failure for the file the viewer moved off", async () => {
    let failFirst: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      previewServer((name) =>
        name === "first.pdf"
          ? new Promise<Response>((resolve) => {
              failFirst = resolve;
            })
          : pages(2),
      ),
    );
    useFileStore.getState().setFiles([pdf("first.pdf")]);
    render(<PdfToImageSettings />, { wrapper });
    await waitFor(() => expect(asked).toEqual(["first.pdf"]));

    act(() => useFileStore.getState().setFiles([pdf("second.pdf")]));
    await waitFor(() => expect(usePdfToImageStore.getState().pageCount).toBe(2));
    await act(async () => failFirst(failed("First was bad")));
    await settle();

    expect(asked).toEqual(["first.pdf", "second.pdf"]);
    const state = usePdfToImageStore.getState();
    expect(state.error).toBeNull();
    expect(state.file?.name).toBe("second.pdf");
    expect(state.pageCount).toBe(2);
    expect(screen.queryByText("First was bad")).not.toBeInTheDocument();
  });

  it("drops an in-flight preview when the file store is emptied or the store is reset (#1981)", async () => {
    let answerPreview: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      previewServer(
        () =>
          new Promise<Response>((resolve) => {
            answerPreview = resolve;
          }),
      ),
    );
    useFileStore.getState().setFiles([pdf("stale.pdf")]);
    render(<PdfToImageSettings />, { wrapper });
    await waitFor(() => expect(asked).toEqual(["stale.pdf"]));

    // Emptying the file store alone (e.g. Clear all) must abort the preview,
    // clear the panel's store, and ignore the late failure.
    act(() => {
      useFileStore.getState().reset();
    });
    expect(previewSignals[0]?.aborted).toBe(true);
    expect(usePdfToImageStore.getState().loadingPreview).toBe(false);
    await act(async () => answerPreview(failed("Stale error")));

    expect(asked).toEqual(["stale.pdf"]);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
    expect(usePdfToImageStore.getState().error).toBeNull();
    expect(usePdfToImageStore.getState().loadingPreview).toBe(false);
    expect(screen.queryByText("Stale error")).not.toBeInTheDocument();
    expect(screen.queryByText("stale.pdf")).not.toBeInTheDocument();

    // Also verify the reset order from #1981: start another deferred preview,
    // empty useFileStore and reset usePdfToImageStore, then resolve with pages.
    act(() => {
      useFileStore.getState().setFiles([pdf("second-stale.pdf")]);
    });
    await waitFor(() => expect(asked).toEqual(["stale.pdf", "second-stale.pdf"]));

    act(() => {
      useFileStore.getState().reset();
      usePdfToImageStore.getState().reset();
    });
    expect(previewSignals[1]?.aborted).toBe(true);
    await act(async () => answerPreview(pages(4)));

    expect(asked).toEqual(["stale.pdf", "second-stale.pdf"]);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
    expect(usePdfToImageStore.getState().error).toBeNull();
    expect(usePdfToImageStore.getState().loadingPreview).toBe(false);
  });

  it("handles rapid PDF selection changes and multi-step removals without sticking loadingPreview (#1981)", async () => {
    vi.stubGlobal(
      "fetch",
      previewServer((name) => (name === "first.pdf" ? new Promise<Response>(() => {}) : pages(2))),
    );
    const first = pdf("first.pdf");
    const second = pdf("second.pdf", "");
    useFileStore.getState().setFiles([first, second]);
    render(<PdfToImageSettings />, { wrapper });
    await waitFor(() => expect(asked).toEqual(["first.pdf"]));
    expect(usePdfToImageStore.getState().loadingPreview).toBe(true);

    // Switch selection to second.pdf and clear all in one synchronous batch:
    // watchFileInStore must stay subscribed across the PDF-to-PDF transition
    // and reset cleanly when the store is emptied.
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
      useFileStore.getState().reset();
    });

    expect(previewSignals[0]?.aborted).toBe(true);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().loadingPreview).toBe(false);
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
  });

  it("does not ask for a preview when the file store holds a non-PDF file, and clears any loaded PDF (#1981)", async () => {
    vi.stubGlobal(
      "fetch",
      previewServer(() => pages(3)),
    );
    const png = new File(["PNG"], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([png]);
    render(<PdfToImageSettings />, { wrapper });
    await act(async () => {});

    expect(asked).toEqual([]);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
    expect(usePdfToImageStore.getState().error).toBeNull();

    // Load a PDF with an empty MIME type and uppercase .PDF extension, then
    // replace it with a PNG: the PDF preview loads, and replacing with PNG
    // resets the store without firing a preview for the PNG.
    act(() => {
      useFileStore.getState().setFiles([pdf("UPPER.PDF", "")]);
    });
    await waitFor(() => expect(usePdfToImageStore.getState().pageCount).toBe(3));
    expect(asked).toEqual(["UPPER.PDF"]);

    act(() => {
      useFileStore.getState().setFiles([png]);
    });
    expect(asked).toEqual(["UPPER.PDF"]);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
    expect(usePdfToImageStore.getState().error).toBeNull();
  });

  it("aborts an in-flight convert when the file store is emptied or a new PDF is set (#1981)", async () => {
    let convertSignal: AbortSignal | undefined;
    let resolveConvert: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/preview")) {
          return Promise.resolve(pages(2));
        }
        convertSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveConvert = resolve;
        });
      }),
    );

    const doc = pdf("convert.pdf");
    useFileStore.getState().setFiles([doc]);
    usePdfToImageStore.getState().setFile(doc);
    usePdfToImageStore.setState({ pageCount: 2, selectedPages: new Set([1, 2]) });

    const convertPromise = usePdfToImageStore.getState().convert();
    expect(usePdfToImageStore.getState().processing).toBe(true);

    act(() => {
      useFileStore.getState().reset();
    });

    expect(convertSignal?.aborted).toBe(true);
    expect(usePdfToImageStore.getState().processing).toBe(false);
    expect(usePdfToImageStore.getState().file).toBeNull();

    resolveConvert(
      new Response(
        JSON.stringify({
          pages: [{ page: 1, downloadUrl: "/dl/p1.png", size: 100 }],
          zipUrl: "/dl/pages.zip",
          zipSize: 200,
        }),
        { status: 200 },
      ),
    );
    await convertPromise;

    expect(usePdfToImageStore.getState().results).toBeNull();
    expect(usePdfToImageStore.getState().zipUrl).toBeNull();
  });

  it("switching from another tool with a loaded file to pdf-to-image or pdf-to-png does not fire a preview (#1981)", async () => {
    let resolveInFlight: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      previewServer((name) =>
        name === "in-flight.pdf"
          ? new Promise<Response>((resolve) => {
              resolveInFlight = resolve;
            })
          : pages(2),
      ),
    );

    render(
      <I18nProvider>
        <MemoryRouter initialEntries={["/pdf/compress-pdf"]}>
          <Link to="/pdf/pdf-to-image" data-testid="go-pdf-to-image">
            PDF to Image
          </Link>
          <Link to="/pdf/pdf-to-png" data-testid="go-pdf-to-png">
            PDF to PNG
          </Link>
          <Routes>
            <Route path="/:section/:toolId" element={<ToolPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );

    act(() => {
      useFileStore.getState().setFiles([pdf("compress.pdf")]);
    });

    fireEvent.click(screen.getByTestId("go-pdf-to-image"));
    await act(async () => {});

    expect(asked).toEqual([]);
    expect(useFileStore.getState().files).toEqual([]);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
    expect(usePdfToImageStore.getState().error).toBeNull();

    // Start an in-flight preview on /pdf/pdf-to-image, then navigate away to
    // /pdf/pdf-to-png before it answers and resolve it after the route switch.
    act(() => {
      useFileStore.getState().setFiles([pdf("in-flight.pdf")]);
    });
    await waitFor(() => expect(asked).toEqual(["in-flight.pdf"]));

    fireEvent.click(screen.getByTestId("go-pdf-to-png"));
    expect(previewSignals[0]?.aborted).toBe(true);
    await act(async () => resolveInFlight(pages(5)));

    expect(asked).toEqual(["in-flight.pdf"]);
    expect(useFileStore.getState().files).toEqual([]);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
    expect(usePdfToImageStore.getState().error).toBeNull();

    // With PdfToImageSettings's React.lazy already resolved, load a PDF on
    // /pdf/pdf-to-png and switch back to /pdf/pdf-to-image: must not ask for a
    // preview of the previous tool's file.
    act(() => {
      useFileStore.getState().setFiles([pdf("preset.pdf")]);
    });

    fireEvent.click(screen.getByTestId("go-pdf-to-image"));
    await act(async () => {});

    expect(asked).toEqual(["in-flight.pdf"]);
    expect(useFileStore.getState().files).toEqual([]);
    expect(usePdfToImageStore.getState().file).toBeNull();
    expect(usePdfToImageStore.getState().pageCount).toBeNull();
    expect(usePdfToImageStore.getState().error).toBeNull();
  });
});
