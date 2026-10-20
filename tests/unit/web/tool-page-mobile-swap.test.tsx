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

const getDocumentSpy = vi.hoisted(() => vi.fn());
const stageDestroySpy = vi.hoisted(() => vi.fn());
const nodeDestroySpy = vi.hoisted(() => vi.fn());
const konvaImages = vi.hoisted(
  () => [] as Array<{ fire: (event: string) => void; handlers: Map<string, Array<() => void>> }>,
);

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: (opts: unknown) => {
    getDocumentSpy(opts);
    return {
      destroy: vi.fn(),
      promise: Promise.resolve({
        numPages: 3,
        loadingTask: { destroy: vi.fn() },
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 595 * scale,
            height: 842 * scale,
          }),
          render: () => ({ promise: Promise.resolve() }),
          cleanup: vi.fn(),
        }),
      }),
    };
  },
}));

vi.mock("../../../apps/web/node_modules/konva", () => {
  class Stage {
    on() {}
    add() {}
    width() {
      return 595;
    }
    height() {
      return 842;
    }
    destroy() {
      stageDestroySpy();
    }
  }
  class Layer {
    children: unknown[] = [];
    add(child: unknown) {
      this.children.push(child);
    }
    getChildren() {
      return this.children;
    }
    batchDraw() {}
  }
  class Transformer {
    selected: unknown[] = [];
    nodes(next?: unknown[]) {
      if (next !== undefined) this.selected = next;
      return this.selected;
    }
  }
  class Image {
    handlers = new Map<string, Array<() => void>>();
    constructor() {
      konvaImages.push(this);
    }
    on(events: string, cb: () => void) {
      for (const evt of events.split(/\s+/).filter(Boolean)) {
        const list = this.handlers.get(evt) ?? [];
        list.push(cb);
        this.handlers.set(evt, list);
      }
    }
    fire(event: string) {
      for (const cb of this.handlers.get(event) ?? []) cb();
    }
    getClientRect() {
      return { x: 10, y: 20, width: 100, height: 50 };
    }
    toDataURL() {
      return "data:image/png;base64,AAA=";
    }
    dragBoundFunc() {}
    remove() {}
    destroy() {
      nodeDestroySpy();
    }
  }
  return {
    default: { Stage, Layer, Transformer, Image },
  };
});

import { I18nProvider } from "@/contexts/i18n-context";
import { addSignature } from "@/lib/signature-store";
import { ToolPage } from "@/pages/tool-page";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";
import { useOrganizeStore } from "@/stores/organize-store";

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

let mobileMatches = true;
const mediaListeners = new Set<(e: MediaQueryListEvent) => void>();

function setMobileViewport(matches: boolean) {
  mobileMatches = matches;
  act(() => {
    for (const listener of mediaListeners) {
      listener({ matches } as MediaQueryListEvent);
    }
  });
}

function renderToolPage(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Link to="/pdf/rotate-pdf" data-testid="switch-tool">
          Switch tool
        </Link>
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  storageMap.clear();
  mediaListeners.clear();
  mobileMatches = true;
  getDocumentSpy.mockClear();
  stageDestroySpy.mockClear();
  nodeDestroySpy.mockClear();
  konvaImages.length = 0;

  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:original-input"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            authEnabled: false,
            bundles: [
              {
                id: "inpaint",
                name: "Object Removal",
                description: "",
                tools: ["erase-object"],
                estimatedSize: "200 MB",
                status: "installed",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    ),
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("max-width") ? mobileMatches : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        if (query.includes("max-width")) mediaListeners.add(cb);
      },
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        mediaListeners.delete(cb);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );

  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);

  // Instant Image load for signature placement and Crop/Eraser canvases.
  class ImmediateImage {
    width = 200;
    height = 80;
    naturalWidth = 200;
    naturalHeight = 80;
    onload: (() => void) | null = null;
    set src(_val: string) {
      this.onload?.();
    }
  }
  vi.stubGlobal("Image", ImmediateImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,thumb",
  );

  useFileStore.getState().reset();
  useOrganizeStore.getState().clear();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  useOrganizeStore.getState().clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ToolPage interactive canvases across the 768px breakpoint (#2248)", () => {
  it("keeps placed signatures and an enabled Apply button in Sign PDF when rotating across 768px", async () => {
    addSignature("data:image/png;base64,sig");
    renderToolPage("/pdf/sign-pdf");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })]);
    });

    const canvas = (await screen.findByTestId("sign-pdf-canvas")) as HTMLCanvasElement;
    await waitFor(() => expect(canvas.getAttribute("width")).not.toBeNull());

    // Open the mobile settings sheet to place a signature.
    fireEvent.click(screen.getByRole("button", { name: "Process" }));

    const applyBefore = await screen.findByRole("button", { name: /Apply & Download/i });
    expect(applyBefore).toBeDisabled();

    // Place the saved signature onto the canvas.
    const savedSigImg = await screen.findByAltText(/saved signature/i);
    fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();
    });
    expect(screen.getByRole("button", { name: /✕ Delete/i })).toBeEnabled();

    // Rotate from portrait (< 768px) to landscape (>= 768px) and back.
    setMobileViewport(false);

    expect(screen.getByTestId("sign-pdf-canvas")).toBe(canvas);
    expect(stageDestroySpy).not.toHaveBeenCalled();
    expect(nodeDestroySpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /✕ Delete/i })).toBeEnabled();

    setMobileViewport(true);

    expect(screen.getByTestId("sign-pdf-canvas")).toBe(canvas);
    expect(stageDestroySpy).not.toHaveBeenCalled();
    expect(nodeDestroySpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();
  });

  it("keeps the signed PDF download link in Sign PDF when rotating across 768px (#2512)", async () => {
    addSignature("data:image/png;base64,sig");
    renderToolPage("/pdf/sign-pdf");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })]);
      useFileStore.getState().updateEntry(0, {
        processedUrl: "/api/v1/download/job-1/contract_signed.pdf",
        processedFilename: "contract_signed.pdf",
        status: "completed",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    const mobileLink = await screen.findByRole("link", { name: /Download signed PDF/i });
    expect(mobileLink).toHaveAttribute("href", "/api/v1/download/job-1/contract_signed.pdf");

    setMobileViewport(false);

    const desktopLink = screen.getByRole("link", { name: /Download signed PDF/i });
    expect(desktopLink).toHaveAttribute("href", "/api/v1/download/job-1/contract_signed.pdf");
    expect(screen.queryByRole("button", { name: /Apply & Download/i })).not.toBeInTheDocument();
  });

  it.each(["dragend", "transformend"] as const)(
    "swaps Download signed PDF back to Apply & Download when a placed signature fires %s and keeps it across 768px (#2535)",
    async (konvaEvent) => {
      addSignature("data:image/png;base64,sig");
      renderToolPage("/pdf/sign-pdf");

      await act(async () => {
        useFileStore
          .getState()
          .setFiles([new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })]);
      });

      const canvas = (await screen.findByTestId("sign-pdf-canvas")) as HTMLCanvasElement;
      await waitFor(() => expect(canvas.getAttribute("width")).not.toBeNull());

      fireEvent.click(screen.getByRole("button", { name: "Process" }));
      const savedSigImg = await screen.findByAltText(/saved signature/i);
      fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);
      await waitFor(() => expect(konvaImages).toHaveLength(1));

      await act(async () => {
        useFileStore.getState().updateEntry(0, {
          processedUrl: "/api/v1/download/job-1/contract_signed.pdf",
          processedFilename: "contract_signed.pdf",
          status: "completed",
        });
      });

      expect(screen.getByRole("link", { name: /Download signed PDF/i })).toBeInTheDocument();

      act(() => {
        konvaImages[0].fire(konvaEvent);
      });

      expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();

      setMobileViewport(false);

      expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();
    },
  );

  it("keeps Apply & Download after adding a signature on a signed entry and rotating across 768px (#2535)", async () => {
    addSignature("data:image/png;base64,sig");
    renderToolPage("/pdf/sign-pdf");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })]);
      useFileStore.getState().updateEntry(0, {
        processedUrl: "/api/v1/download/job-1/contract_signed.pdf",
        processedFilename: "contract_signed.pdf",
        status: "completed",
      });
    });

    const canvas = (await screen.findByTestId("sign-pdf-canvas")) as HTMLCanvasElement;
    await waitFor(() => expect(canvas.getAttribute("width")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    expect(await screen.findByRole("link", { name: /Download signed PDF/i })).toBeInTheDocument();

    const savedSigImg = await screen.findByAltText(/saved signature/i);
    fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);

    expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();

    // Rotating to desktop (>= 768px) remounts SignPdfSettings; Apply & Download must stay visible.
    setMobileViewport(false);

    expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();
  });

  it("keeps Apply & Download after deleting a signature on a signed entry and rotating across 768px (#2535)", async () => {
    addSignature("data:image/png;base64,sig");
    renderToolPage("/pdf/sign-pdf");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })]);
    });

    const canvas = (await screen.findByTestId("sign-pdf-canvas")) as HTMLCanvasElement;
    await waitFor(() => expect(canvas.getAttribute("width")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    const savedSigImg = await screen.findByAltText(/saved signature/i);
    fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);
    fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);
    await waitFor(() => expect(konvaImages).toHaveLength(2));

    await act(async () => {
      useFileStore.getState().updateEntry(0, {
        processedUrl: "/api/v1/download/job-1/contract_signed.pdf",
        processedFilename: "contract_signed.pdf",
        status: "completed",
      });
    });
    expect(screen.getByRole("link", { name: /Download signed PDF/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /✕ Delete/i }));
    expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();

    // Rotating to desktop (>= 768px) remounts SignPdfSettings; Apply & Download must stay visible.
    setMobileViewport(false);

    expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();

    // Selecting and deleting the remaining signature disables Apply & Download while keeping
    // Download signed PDF hidden across 768px.
    act(() => {
      konvaImages[0].fire("click");
    });
    fireEvent.click(screen.getByRole("button", { name: /✕ Delete/i }));
    expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeDisabled();

    setMobileViewport(true);
    expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeDisabled();
  });

  it.each(["dragend", "transformend"] as const)(
    "keeps Apply & Download visible when a placed signature fires %s while a sign request is in flight and across 768px (#3100)",
    async (konvaEvent) => {
      class FakeInFlightXhr {
        static instances: FakeInFlightXhr[] = [];
        timeout = 0;
        status = 0;
        responseText = "";
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        ontimeout: (() => void) | null = null;
        upload: { onprogress: unknown; onload: unknown } = { onprogress: null, onload: null };
        constructor() {
          FakeInFlightXhr.instances.push(this);
        }
        open() {}
        setRequestHeader() {}
        send() {}
        abort() {}
        respond(status: number, body: unknown) {
          act(() => {
            this.status = status;
            this.responseText = JSON.stringify(body);
            this.onload?.();
          });
        }
      }
      class FakeInFlightEventSource {
        static OPEN = 1;
        readyState = 1;
        onmessage: ((event: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;
        close() {
          this.readyState = 2;
        }
      }
      vi.stubGlobal("XMLHttpRequest", FakeInFlightXhr);
      vi.stubGlobal("EventSource", FakeInFlightEventSource);

      addSignature("data:image/png;base64,sig");
      renderToolPage("/pdf/sign-pdf");

      await act(async () => {
        useFileStore
          .getState()
          .setFiles([new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })]);
      });

      const canvas = (await screen.findByTestId("sign-pdf-canvas")) as HTMLCanvasElement;
      await waitFor(() => expect(canvas.getAttribute("width")).not.toBeNull());

      fireEvent.click(screen.getByRole("button", { name: "Process" }));
      const savedSigImg = await screen.findByAltText(/saved signature/i);
      fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);
      await waitFor(() => expect(konvaImages).toHaveLength(1));

      fireEvent.click(screen.getByRole("button", { name: /Apply & Download/i }));
      await waitFor(() => expect(FakeInFlightXhr.instances).toHaveLength(1));
      expect(screen.getByRole("button", { name: /Signing/i })).toBeDisabled();

      // Drag or transform the signature while the sign request is still in flight.
      act(() => {
        konvaImages[0].fire(konvaEvent);
      });

      FakeInFlightXhr.instances[0].respond(200, {
        downloadUrl: "/api/v1/download/job-1/contract_signed.pdf",
      });

      expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();

      // Rotating across 768px keeps Apply & Download visible instead of restoring the
      // superseded download link from currentEntry.processedUrl.
      setMobileViewport(false);
      expect(screen.queryByRole("link", { name: /Download signed PDF/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Apply & Download/i })).toBeEnabled();

      // Re-signing with the updated placement clears the stale state and shows the new link.
      FakeInFlightXhr.instances = [];
      fireEvent.click(screen.getByRole("button", { name: /Apply & Download/i }));
      await waitFor(() => expect(FakeInFlightXhr.instances).toHaveLength(1));
      FakeInFlightXhr.instances[0].respond(200, {
        downloadUrl: "/api/v1/download/job-2/contract_signed.pdf",
      });
      expect(screen.getByRole("link", { name: /Download signed PDF/i })).toHaveAttribute(
        "href",
        "/api/v1/download/job-2/contract_signed.pdf",
      );
    },
  );

  it("keeps the failed-run error message in Sign PDF when rotating across 768px (#2512)", async () => {
    addSignature("data:image/png;base64,sig");
    renderToolPage("/pdf/sign-pdf");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["%PDF-1.4"], "contract.pdf", { type: "application/pdf" })]);
      useFileStore.getState().updateEntry(0, {
        status: "failed",
        error: "PDF is password-protected",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    expect(await screen.findByText("PDF is password-protected")).toBeInTheDocument();

    setMobileViewport(false);

    expect(screen.getByText("PDF is password-protected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Report issue/i })).toBeInTheDocument();
  });

  it("keeps painted strokes in Erase Object when rotating across 768px", async () => {
    useFeaturesStore.setState({
      loaded: true,
      bundles: [
        {
          id: "inpaint",
          name: "Object Removal",
          description: "",
          tools: ["erase-object"],
          estimatedSize: "200 MB",
          status: "installed",
        },
      ],
    });

    renderToolPage("/image/erase-object");

    await act(async () => {
      useFileStore.getState().setFiles([new File(["img"], "photo.png", { type: "image/png" })]);
    });

    const viewport = await screen.findByTestId("zoom-viewport");
    const measureImg = viewport.querySelector("img") as HTMLImageElement;
    Object.defineProperty(measureImg, "naturalWidth", { value: 400, configurable: true });
    Object.defineProperty(measureImg, "naturalHeight", { value: 300, configurable: true });
    Object.defineProperty(viewport, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 300, configurable: true });
    fireEvent.load(measureImg);

    const drawCanvas = (await screen.findByTestId("zoom-content")).querySelector(
      "canvas",
    ) as HTMLCanvasElement;
    vi.spyOn(drawCanvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(drawCanvas, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(drawCanvas, { clientX: 100, clientY: 100 });
    fireEvent.mouseUp(drawCanvas);

    // Open mobile settings sheet and verify the stroke registered.
    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Clear$/i })).toBeInTheDocument();
    });

    // Rotate across 768px: the canvas and its painted stroke must survive.
    setMobileViewport(false);

    expect(screen.getByTestId("zoom-viewport")).toBe(viewport);
    expect(screen.getByRole("button", { name: /^Clear$/i })).toBeInTheDocument();
  });

  it("keeps the CropCanvas mounted and preserves crop selection when rotating across 768px", async () => {
    renderToolPage("/image/crop");

    await act(async () => {
      useFileStore.getState().setFiles([new File(["img"], "photo.png", { type: "image/png" })]);
    });

    const cropImg = await screen.findByAltText("Crop preview");
    Object.defineProperty(cropImg, "naturalWidth", { value: 800, configurable: true });
    Object.defineProperty(cropImg, "naturalHeight", { value: 600, configurable: true });
    fireEvent.load(cropImg);

    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    const ratioBtn = await screen.findByRole("button", { name: "1:1" });
    fireEvent.click(ratioBtn);

    setMobileViewport(false);

    expect(screen.getByAltText("Crop preview")).toBe(cropImg);
    expect(screen.getByText("Crop region: 600 x 600")).toBeInTheDocument();
  });

  it("keeps Organize PDF page order and rendered grid when rotating across 768px and clears on unmount", async () => {
    const pdfFile = new File(["%PDF-1.4"], "pages.pdf", { type: "application/pdf" });
    pdfFile.arrayBuffer = async () => new ArrayBuffer(8);

    const view = renderToolPage("/pdf/organize-pdf");

    await act(async () => {
      useFileStore.getState().setFiles([pdfFile]);
    });

    const page1 = await screen.findByTestId("organize-page-1");
    expect(useOrganizeStore.getState().pageOrder).toEqual([1, 2, 3]);

    act(() => {
      useOrganizeStore.getState().movePage(2, 0);
    });
    expect(useOrganizeStore.getState().pageOrder).toEqual([3, 1, 2]);
    fireEvent.click(screen.getByRole("button", { name: "Process" }));
    expect(await screen.findByDisplayValue("3-z,1,2")).toBeInTheDocument();

    const docCallsBeforeRotate = getDocumentSpy.mock.calls.length;

    // Rotate across 768px: the grid and the arranged order must survive without reloading.
    setMobileViewport(false);

    expect(screen.getByTestId("organize-page-1")).toBe(page1);
    expect(useOrganizeStore.getState().pageOrder).toEqual([3, 1, 2]);
    expect(screen.getByDisplayValue("3-z,1,2")).toBeInTheDocument();
    expect(getDocumentSpy).toHaveBeenCalledTimes(docCallsBeforeRotate);

    // Switching to another tool route while ToolPage stays mounted clears the organize store.
    fireEvent.click(screen.getByTestId("switch-tool"));
    await waitFor(() => {
      expect(useOrganizeStore.getState()).toMatchObject({
        file: null,
        pageOrder: [],
        pageCount: 0,
      });
    });

    // Seed again and verify unmounting ToolPage also clears the organize store.
    act(() => {
      useOrganizeStore.getState().setDocument(pdfFile, 3);
    });
    expect(useOrganizeStore.getState().pageCount).toBe(3);
    view.unmount();
    expect(useOrganizeStore.getState()).toMatchObject({
      file: null,
      pageOrder: [],
      pageCount: 0,
    });
  });

  it("keeps Remove Background controls and recorded removalRefine when resizing across 768px (#2489)", async () => {
    useFeaturesStore.setState({
      loaded: true,
      bundles: [
        {
          id: "remove_bg",
          name: "Background Removal",
          description: "",
          tools: ["remove-background"],
          estimatedSize: "300 MB",
          status: "installed",
        },
      ],
    });

    setMobileViewport(false);
    renderToolPage("/image/remove-background");

    await act(async () => {
      useFileStore.getState().setFiles([new File(["img"], "portrait.png", { type: "image/png" })]);
    });

    fireEvent.click(await screen.findByText("Effects"));
    fireEvent.change(screen.getByTestId("remove-background-edge-refine"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByTestId("remove-background-decontaminate"));

    // Simulate a finished single-file removal for the loaded file.
    fireEvent.click(screen.getByTestId("remove-background-submit"));
    await act(async () => {
      useFileStore.getState().setProcessing(false);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "/api/v1/download/job-bg-2489/portrait_mask.png",
        processedSize: 512,
      });
    });

    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();
    expect(screen.queryByTestId("remove-background-refine-stale")).not.toBeInTheDocument();

    // Resize below 768px (desktop -> mobile) and open the mobile settings sheet.
    setMobileViewport(true);
    fireEvent.click(screen.getByRole("button", { name: "Process" }));

    expect(await screen.findByTestId("remove-background-download")).toBeInTheDocument();
    expect(screen.getByTestId("remove-background-edge-refine")).toHaveValue("3");
    expect(screen.getByText("Strong")).toBeVisible();
    expect(screen.getByTestId("remove-background-decontaminate")).toBeChecked();
    expect(screen.queryByTestId("remove-background-refine-stale")).not.toBeInTheDocument();

    // Moving edge smoothing away from 3 flags the cutout as stale on mobile.
    fireEvent.change(screen.getByTestId("remove-background-edge-refine"), {
      target: { value: "0" },
    });
    expect(screen.getByTestId("remove-background-refine-stale")).toBeInTheDocument();

    // Resize back above 768px (mobile -> desktop): stale state and modified slider survive.
    setMobileViewport(false);
    expect(screen.getByTestId("remove-background-edge-refine")).toHaveValue("0");
    expect(screen.getByTestId("remove-background-decontaminate")).toBeChecked();
    expect(screen.getByTestId("remove-background-refine-stale")).toBeInTheDocument();

    // Restoring edge smoothing to 3 settles the stale notice.
    fireEvent.change(screen.getByTestId("remove-background-edge-refine"), {
      target: { value: "3" },
    });
    expect(screen.queryByTestId("remove-background-refine-stale")).not.toBeInTheDocument();
  });

  it("keeps a Phase 2 effectsError in Remove Background when resizing across 768px (#2559)", async () => {
    useFeaturesStore.setState({
      loaded: true,
      bundles: [
        {
          id: "remove_bg",
          name: "Background Removal",
          description: "",
          tools: ["remove-background"],
          estimatedSize: "300 MB",
          status: "installed",
        },
      ],
    });

    const baseFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.endsWith("/api/v1/tools/image/remove-background/effects")) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "Effects compositing failed" }), { status: 500 }),
          );
        }
        return baseFetch(input, init);
      }),
    );

    setMobileViewport(false);
    renderToolPage("/image/remove-background");

    await act(async () => {
      useFileStore.getState().setFiles([new File(["img"], "portrait.png", { type: "image/png" })]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "/api/v1/download/job-bg-2559/portrait_mask.png",
        processedSize: 512,
      });
    });

    fireEvent.click(await screen.findByTestId("remove-background-format-webp"));
    fireEvent.click(await screen.findByTestId("remove-background-download-effects"));

    expect(await screen.findByText("Effects compositing failed")).toBeVisible();

    // Resize below 768px (desktop -> mobile) and open the mobile settings sheet.
    setMobileViewport(true);
    fireEvent.click(screen.getByRole("button", { name: "Process" }));

    expect(await screen.findByTestId("remove-background-download-effects")).toBeVisible();
    expect(screen.getByText("Effects compositing failed")).toBeVisible();

    // Resize back above 768px (mobile -> desktop): error remains visible.
    setMobileViewport(false);
    expect(screen.getByTestId("remove-background-download-effects")).toBeVisible();
    expect(screen.getByText("Effects compositing failed")).toBeVisible();
  });
});
