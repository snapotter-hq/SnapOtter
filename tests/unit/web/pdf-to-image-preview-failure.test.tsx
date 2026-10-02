// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

/** The file name of every preview request, in order. */
let asked: string[] = [];

function failed(message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status: 422 });
}

function pages(count: number): Response {
  return new Response(JSON.stringify({ pageCount: count, thumbnails: [] }));
}

/** Answers each preview with `answer(fileName)`, up to ANSWER_CAP requests. */
function previewServer(answer: (name: string) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).includes("/preview")) throw new Error(`unexpected request: ${input}`);
    const body = init?.body;
    if (!(body instanceof FormData)) throw new Error("preview sent without a form body");
    const name = (body.get("file") as File).name;
    asked.push(name);
    if (asked.length > ANSWER_CAP) return new Promise<Response>(() => {});
    return answer(name);
  });
}

function pdf(name = "doc.pdf"): File {
  return new File(["%PDF"], name, { type: "application/pdf" });
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
});
