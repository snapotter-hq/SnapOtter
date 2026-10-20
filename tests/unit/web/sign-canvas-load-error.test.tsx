// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getDocument = vi.hoisted(() => vi.fn());
const captureHandledError = vi.hoisted(() => vi.fn());
const konvaState = vi.hoisted(() => ({
  layers: [] as Array<{
    children: unknown[];
    batchDraw: ReturnType<typeof vi.fn>;
  }>,
  transformers: [] as Array<{
    selectedNodes: unknown[];
  }>,
}));

// A genuine pdf.js load or page-render failure (corrupt/encrypted file, broken
// page stream, or refused canvas allocation). The teardown-path rejection
// (loadingTask.destroy() or renderTask.cancel() mid-flight) is a separate,
// expected path and must stay silent; see #478 and #2249.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument,
}));

vi.mock("@/lib/analytics", () => ({
  captureHandledError,
}));

vi.mock("../../../apps/web/node_modules/konva", () => {
  class Node {
    parent: Node | null = null;
    children: Node[] = [];
    selectedNodes: Node[] = [];
    handlers = new Map<string, Array<() => void>>();
    batchDraw = vi.fn();
    on(events: string, cb?: () => void) {
      if (!cb) return;
      for (const evt of events.split(/\s+/).filter(Boolean)) {
        const list = this.handlers.get(evt) ?? [];
        list.push(cb);
        this.handlers.set(evt, list);
      }
    }
    fire(event: string) {
      for (const cb of this.handlers.get(event) ?? []) cb();
    }
    add(child: Node) {
      child.parent = this;
      if (!this.children.includes(child)) {
        this.children.push(child);
      }
    }
    remove() {
      if (this.parent) {
        this.parent.children = this.parent.children.filter((c) => c !== this);
        this.parent = null;
      }
    }
    nodes(next?: Node[]) {
      if (next !== undefined) {
        this.selectedNodes = next;
      }
      return this.selectedNodes;
    }
    width() {
      return 600;
    }
    height() {
      return 800;
    }
    getChildren() {
      return this.children;
    }
    getClientRect() {
      return { x: 10, y: 20, width: 100, height: 50 };
    }
    dragBoundFunc() {}
    toDataURL() {
      return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    }
    destroy() {
      this.remove();
    }
  }
  class Stage extends Node {}
  class Layer extends Node {
    constructor() {
      super();
      konvaState.layers.push(this);
    }
  }
  class Transformer extends Node {
    constructor() {
      super();
      konvaState.transformers.push(this);
    }
  }
  class Image extends Node {}
  return {
    default: Object.assign(Node, { Stage, Layer, Transformer, Image }),
  };
});

import { SignCanvas, type SignCanvasRef } from "@/components/tools/sign-canvas";

class ImmediateImage {
  width = 200;
  height = 80;
  onload: (() => void) | null = null;
  set src(_value: string) {
    this.onload?.();
  }
}

beforeEach(() => {
  captureHandledError.mockReset();
  getDocument.mockReset();
  konvaState.layers = [];
  konvaState.transformers = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SignCanvas load and page-render failures (#2249)", () => {
  it("shows a visible error instead of a blank canvas when the PDF cannot load", async () => {
    getDocument.mockReturnValue({
      promise: Promise.reject(new Error("Invalid PDF structure")),
    });

    render(<SignCanvas fileUrl="blob:bad-pdf" />);

    expect(await screen.findByText(/couldn't display this pdf/i)).toBeInTheDocument();
    // The dead canvas and page controls are gone; the user is not left staring
    // at an empty page that looks like it is still loading.
    expect(screen.queryByTestId("sign-pdf-canvas")).not.toBeInTheDocument();
  });

  it("shows the error state, reports to Sentry when getPage() rejects, and recovers on a valid file", async () => {
    const pageError = new Error("Page tree is corrupt");
    getDocument.mockImplementation(({ url }: { url: string }) => {
      if (url === "blob:bad-page") {
        return {
          promise: Promise.resolve({
            numPages: 1,
            loadingTask: { destroy: vi.fn() },
            getPage: () => Promise.reject(pageError),
          }),
        };
      }
      return {
        promise: Promise.resolve({
          numPages: 1,
          loadingTask: { destroy: vi.fn() },
          getPage: async () => ({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 595 * scale,
              height: 842 * scale,
            }),
            render: () => ({ promise: Promise.resolve() }),
          }),
        }),
      };
    });

    const { rerender } = render(<SignCanvas fileUrl="blob:bad-page" />);

    expect(await screen.findByText(/couldn't display this pdf/i)).toBeInTheDocument();
    expect(screen.queryByTestId("sign-pdf-canvas")).not.toBeInTheDocument();
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(captureHandledError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sign PDF page failed to render",
        cause: pageError,
      }),
      { error_class: "operational", tool_id: "sign-pdf" },
    );

    rerender(<SignCanvas fileUrl="blob:good-pdf" />);
    await waitFor(() =>
      expect(screen.getByTestId("sign-pdf-canvas").getAttribute("width")).not.toBeNull(),
    );
    expect(screen.queryByText(/couldn't display this pdf/i)).not.toBeInTheDocument();
  });

  it("shows the error state and reports to Sentry when page.render() rejects", async () => {
    const renderError = new Error("Canvas allocation refused");
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        loadingTask: { destroy: vi.fn() },
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 595 * scale,
            height: 842 * scale,
          }),
          render: () => ({ promise: Promise.reject(renderError) }),
        }),
      }),
    });

    render(<SignCanvas fileUrl="blob:bad-render" />);

    expect(await screen.findByText(/couldn't display this pdf/i)).toBeInTheDocument();
    expect(screen.queryByTestId("sign-pdf-canvas")).not.toBeInTheDocument();
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(captureHandledError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sign PDF page failed to render",
        cause: renderError,
      }),
      { error_class: "operational", tool_id: "sign-pdf" },
    );
  });

  it("tears down placements and parent state when a later page fails to render", async () => {
    vi.stubGlobal("Image", ImmediateImage);
    const page2Error = new Error("Page 2 stream corrupt");
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        loadingTask: { destroy: vi.fn() },
        getPage: async (n: number) => {
          if (n === 2) throw page2Error;
          return {
            getViewport: ({ scale }: { scale: number }) => ({
              width: 595 * scale,
              height: 842 * scale,
            }),
            render: () => ({ promise: Promise.resolve() }),
          };
        },
      }),
    });

    const onCountChange = vi.fn();
    const onSelectionChange = vi.fn();
    const ref = createRef<SignCanvasRef>();
    render(
      <SignCanvas
        ref={ref}
        fileUrl="blob:two-pages"
        onCountChange={onCountChange}
        onSelectionChange={onSelectionChange}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("sign-pdf-canvas").getAttribute("width")).not.toBeNull(),
    );
    await act(async () => {});

    act(() => {
      ref.current?.addSignature({
        id: "sig-1",
        dataUrl: "data:image/png;base64,AAA=",
        createdAt: 1,
      });
    });
    expect(ref.current?.hasPlacements()).toBe(true);
    expect(onCountChange).toHaveBeenLastCalledWith(1);
    expect(onSelectionChange).toHaveBeenLastCalledWith(true);

    // Navigate to page 2, which fails to render.
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/couldn't display this pdf/i)).toBeInTheDocument();
    expect(ref.current?.hasPlacements()).toBe(false);
    expect(onCountChange).toHaveBeenLastCalledWith(0);
    expect(onSelectionChange).toHaveBeenLastCalledWith(false);
    await expect(ref.current?.exportPlacements()).rejects.toThrow(
      /not ready to export placements/i,
    );
  });

  it("cancels the in-flight renderTask when navigating pages mid-render without triggering loadFailed", async () => {
    let rejectPage1Render: ((reason: unknown) => void) | null = null;
    const cancelPage1 = vi.fn(() => {
      rejectPage1Render?.(new Error("RenderingCancelledException"));
    });

    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        loadingTask: { destroy: vi.fn() },
        getPage: async (n: number) => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 595 * scale,
            height: 842 * scale,
          }),
          render: () => {
            if (n === 1) {
              return {
                cancel: cancelPage1,
                promise: new Promise<void>((_resolve, reject) => {
                  rejectPage1Render = reject;
                }),
              };
            }
            return {
              cancel: vi.fn(),
              promise: Promise.resolve(),
            };
          },
        }),
      }),
    });

    render(<SignCanvas fileUrl="blob:two-pages" />);
    await waitFor(() => expect(rejectPage1Render).not.toBeNull());

    // Switch to page 2 while page 1's render is still running.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    });

    expect(cancelPage1).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/couldn't display this pdf/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("sign-pdf-canvas")).toBeInTheDocument();
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("ignores render rejections caused by unmount or file-swap teardown", async () => {
    let rejectFirstRender: ((reason: unknown) => void) | null = null;
    let rejectSecondRender: ((reason: unknown) => void) | null = null;
    getDocument.mockImplementation(({ url }: { url: string }) => {
      if (url === "blob:first") {
        return {
          promise: Promise.resolve({
            numPages: 1,
            loadingTask: {
              destroy: () => {
                rejectFirstRender?.(new Error("Worker was destroyed"));
              },
            },
            getPage: async () => ({
              getViewport: ({ scale }: { scale: number }) => ({
                width: 595 * scale,
                height: 842 * scale,
              }),
              render: () => ({
                promise: new Promise<void>((_resolve, reject) => {
                  rejectFirstRender = reject;
                }),
              }),
            }),
          }),
        };
      }
      return {
        promise: Promise.resolve({
          numPages: 1,
          loadingTask: {
            destroy: () => {
              rejectSecondRender?.(new Error("Unmounted mid-render"));
            },
          },
          getPage: async () => ({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 595 * scale,
              height: 842 * scale,
            }),
            render: () => ({
              promise: new Promise<void>((_resolve, reject) => {
                rejectSecondRender = reject;
              }),
            }),
          }),
        }),
      };
    });

    const { rerender, unmount } = render(<SignCanvas fileUrl="blob:first" />);
    await waitFor(() => expect(rejectFirstRender).not.toBeNull());

    // Swap files while the first file's render is in flight; loadingTask.destroy()
    // rejects the first render synchronously during the load effect cleanup.
    rerender(<SignCanvas fileUrl="blob:second" />);

    await waitFor(() => expect(rejectSecondRender).not.toBeNull());
    expect(screen.queryByText(/couldn't display this pdf/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("sign-pdf-canvas")).toBeInTheDocument();
    expect(captureHandledError).not.toHaveBeenCalled();

    unmount();
    await act(async () => {});
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("rejects exportPlacements when called before the canvas layer is ready", async () => {
    getDocument.mockReturnValue({
      promise: new Promise(() => {}),
    });

    const ref = createRef<SignCanvasRef>();
    render(<SignCanvas ref={ref} fileUrl="blob:pending-doc" />);

    await expect(ref.current?.exportPlacements()).rejects.toThrow(
      /not ready to export placements/i,
    );
  });

  it("rejects exportPlacements instead of silently dropping a placement whose page metadata is missing, and restores the current page view", async () => {
    vi.stubGlobal("Image", ImmediateImage);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ blob: async () => new Blob(["png"], { type: "image/png" }) })),
    );

    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        loadingTask: { destroy: vi.fn() },
        getPage: async (n: number) => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 595 * scale,
            height: 842 * scale,
          }),
          render: () => ({
            // Page 1 finishes rendering; page 2 stays pending so its pageMetaRef
            // entry (index 1) is never stored.
            promise: n === 1 ? Promise.resolve() : new Promise<void>(() => {}),
          }),
        }),
      }),
    });

    const ref = createRef<SignCanvasRef>();
    render(<SignCanvas ref={ref} fileUrl="blob:two-pages" />);

    // Wait for page 1 to finish rendering and populate stageRef/layerRef + pageMetaRef(0).
    await waitFor(() => expect(konvaState.layers).toHaveLength(1));

    // Place a signature on page 1 (which has metadata).
    act(() => {
      ref.current?.addSignature({
        id: "sig-1",
        dataUrl: "data:image/png;base64,AAA=",
        createdAt: 1,
      });
    });

    // Navigate to page 2 (whose render never finishes, so pageMetaRef has no entry
    // for index 1) and place a second signature there.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    });
    act(() => {
      ref.current?.addSignature({
        id: "sig-2",
        dataUrl: "data:image/png;base64,BBB=",
        createdAt: 2,
      });
    });

    const layer = konvaState.layers[0];
    const tr = konvaState.transformers[0];
    expect(tr.selectedNodes).toHaveLength(1);

    await expect(ref.current?.exportPlacements()).rejects.toThrow(/page 2/i);

    // The finally block re-attaches the current page's signature node and restores selection.
    expect(layer.children).toHaveLength(2); // transformer + current page's Konva.Image
    expect(tr.selectedNodes).toHaveLength(1);
    expect(layer.batchDraw).toHaveBeenCalled();
  });

  it("notifies onPlacementsChange on addSignature, dragend, transformend, and deleteSelected (#2535)", async () => {
    vi.stubGlobal("Image", ImmediateImage);
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        loadingTask: { destroy: vi.fn() },
        getPage: async () => ({
          getViewport: ({ scale }: { scale: number }) => ({
            width: 595 * scale,
            height: 842 * scale,
          }),
          render: () => ({ promise: Promise.resolve() }),
        }),
      }),
    });

    const onPlacementsChange = vi.fn();
    const ref = createRef<SignCanvasRef>();
    render(
      <SignCanvas ref={ref} fileUrl="blob:one-page" onPlacementsChange={onPlacementsChange} />,
    );

    await waitFor(() => expect(konvaState.layers).toHaveLength(1));
    expect(onPlacementsChange).not.toHaveBeenCalled();

    act(() => {
      ref.current?.addSignature({
        id: "sig-1",
        dataUrl: "data:image/png;base64,AAA=",
        createdAt: 1,
      });
    });
    expect(onPlacementsChange).toHaveBeenCalledTimes(1);

    const placedNode = konvaState.transformers[0].selectedNodes[0] as {
      fire: (event: string) => void;
    };
    act(() => {
      placedNode.fire("dragend");
    });
    expect(onPlacementsChange).toHaveBeenCalledTimes(2);

    act(() => {
      placedNode.fire("transformend");
    });
    expect(onPlacementsChange).toHaveBeenCalledTimes(3);

    act(() => {
      ref.current?.deleteSelected();
    });
    expect(onPlacementsChange).toHaveBeenCalledTimes(4);

    // Calling deleteSelected when nothing is selected is a no-op.
    act(() => {
      ref.current?.deleteSelected();
    });
    expect(onPlacementsChange).toHaveBeenCalledTimes(4);
  });
});
