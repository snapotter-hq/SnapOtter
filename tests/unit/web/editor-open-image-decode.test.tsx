// @vitest-environment jsdom

/**
 * #2530: EditorPage's handleOpenImage and handlePaste:
 * - Server-decoded formats (.psd, .tga, .exr, .hdr) follow 202 responses from
 *   /api/v1/tools/image/convert through /api/v1/jobs/:jobId/progress instead of
 *   dropping them when SYNC_WAIT_MS expires.
 * - Both the convert POST and the downloadUrl fetch carry formatHeaders().
 * - Non-2xx responses, network failures, malformed 2xx/SSE payloads, and stall
 *   timeouts surface a toast and report operational faults via captureHandledError
 *   or reportMalformedResult.
 * - Non-2xx or zero-byte downloadUrl responses and Image onerror events (server-decoded,
 *   client-decoded, and clipboard paste) revoke their blob URL and toast
 *   t.editor.ui.captureFailure.sourceImageFailed.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());

// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));
vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => false }));
vi.mock("@/components/editor/editor-canvas", () => ({
  EditorCanvas: () => <div data-testid="editor-canvas" />,
  editorStageRefHolder: { current: null },
}));
vi.mock("@/components/editor/editor-options-bar", () => ({
  EditorOptionsBar: () => null,
}));
vi.mock("@/components/editor/editor-toolbar", () => ({
  EditorToolbar: () => null,
}));
vi.mock("@/components/editor/editor-right-panel", () => ({
  EditorRightPanel: () => null,
}));
vi.mock("@/components/editor/editor-status-bar", () => ({
  EditorStatusBar: () => null,
}));
vi.mock("@/components/editor/common/rulers", () => ({
  HorizontalRuler: () => null,
  VerticalRuler: () => null,
}));

import { captureHandledError } from "@/lib/analytics";
import { EditorPage } from "@/pages/editor-page";
import { useEditorStore } from "@/stores/editor-store";

const SOURCE_IMAGE_FAILED = en.editor.ui.captureFailure.sourceImageFailed;

class FakeImage {
  static instances: FakeImage[] = [];
  static shouldFail = false;
  static manual = false;
  static naturalWidth = 320;
  static naturalHeight = 240;

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  naturalWidth = FakeImage.naturalWidth;
  naturalHeight = FakeImage.naturalHeight;
  private _src = "";

  constructor() {
    FakeImage.instances.push(this);
  }

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    if (FakeImage.manual) return;
    queueMicrotask(() => {
      if (FakeImage.shouldFail) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    });
  }
}

class FakeEventSource {
  static OPEN = 1;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  close() {
    this.readyState = 2;
  }
}

let createdInputs: HTMLInputElement[] = [];
let loadImageSpy = vi.fn();

beforeEach(() => {
  toastError.mockReset();
  vi.mocked(captureHandledError).mockClear();
  FakeImage.instances = [];
  FakeImage.shouldFail = false;
  FakeImage.manual = false;
  FakeImage.naturalWidth = 320;
  FakeImage.naturalHeight = 240;
  FakeEventSource.instances = [];
  createdInputs = [];
  loadImageSpy = vi.fn((url: string, width: number, height: number) => {
    useEditorStore.setState({
      sourceImageUrl: url,
      sourceImageSize: { width, height },
      canvasSize: { width, height },
    });
  });
  useEditorStore.setState({
    sourceImageUrl: null,
    sourceImageSize: null,
    canvasSize: { width: 800, height: 600 },
    loadImage: loadImageSpy,
    rulersVisible: false,
  });

  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.spyOn(console, "error").mockImplementation(() => {});

  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          translate: () => {},
          rotate: () => {},
          scale: () => {},
          fillRect: () => {},
          clearRect: () => {},
          drawImage: () => {},
        }),
        toDataURL: () => "data:image/png;base64,REBAKED",
      } as unknown as HTMLCanvasElement;
    }
    const el = realCreate(tag);
    if (tag === "input") {
      vi.spyOn(el as HTMLInputElement, "click").mockImplementation(() => {});
      createdInputs.push(el as HTMLInputElement);
    }
    return el;
  }) as typeof document.createElement);

  let blobCounter = 0;
  URL.createObjectURL = vi.fn(() => `blob:opened-${++blobCounter}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={["/editor"]}>
      <EditorPage />
    </MemoryRouter>,
  );
}

async function openFileViaMenu(file: File) {
  fireEvent.click(screen.getByTestId("menu-file"));
  fireEvent.click(screen.getByTestId("menu-item-open"));
  const input = createdInputs[createdInputs.length - 1];
  expect(input).toBeDefined();
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  await act(async () => {
    await input.onchange?.(new Event("change") as unknown as Event);
  });
}

describe("EditorPage Open Image server decode (#2530)", () => {
  it.each(["psd", "tga", "exr", "hdr"] as const)(
    "follows a 202 .%s decode through SSE progress, fetches the PNG with auth headers, and loads the image",
    async (ext) => {
      const store = new Map<string, string>([["snapotter-token", "tok-open"]]);
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      });

      const fetchCalls: Array<{ url: string; headers?: Headers }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          fetchCalls.push({ url, headers: init?.headers as Headers | undefined });
          if (url.includes("/tools/image/convert")) {
            return {
              ok: true,
              status: 202,
              json: async () => ({ jobId: `job-${ext}`, async: true }),
            };
          }
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(["png-bytes"], { type: "image/png" }),
          };
        }),
      );

      renderEditor();
      await openFileViaMenu(new File(["raw"], `artwork.${ext}`));

      await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
      const es = FakeEventSource.instances[0];
      expect(es.url).toBe(`/api/v1/jobs/job-${ext}/progress`);
      expect(loadImageSpy).not.toHaveBeenCalled();

      await act(async () => {
        es.onmessage?.({
          data: JSON.stringify({
            type: "single",
            phase: "complete",
            result: { downloadUrl: `/api/v1/download/job-${ext}/artwork.png` },
          }),
        });
      });

      await waitFor(() => expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240));
      expect(toastError).not.toHaveBeenCalled();
      expect(es.readyState).toBe(2);
      expect(fetchCalls).toHaveLength(2);
      expect(fetchCalls[0].headers?.get("Authorization")).toBe("Bearer tok-open");
      expect(fetchCalls[1].url).toBe(`/api/v1/download/job-${ext}/artwork.png`);
      expect(fetchCalls[1].headers?.get("Authorization")).toBe("Bearer tok-open");
    },
  );

  it("loads a sync 200 server-decoded image and sends auth headers on both requests", async () => {
    const store = new Map<string, string>([["snapotter-token", "tok-sync"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    });

    const fetchCalls: Array<{ url: string; headers?: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, headers: init?.headers as Headers | undefined });
        if (url.includes("/tools/image/convert")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ downloadUrl: "/api/v1/download/job-sync/layer.png" }),
          };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["png-bytes"], { type: "image/png" }),
        };
      }),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "layer.psd"));

    await waitFor(() => expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240));
    expect(toastError).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].headers?.get("Authorization")).toBe("Bearer tok-sync");
    expect(fetchCalls[1].headers?.get("Authorization")).toBe("Bearer tok-sync");
  });

  it.each([
    [
      "a 422 error with details",
      422,
      { error: "Unsupported PSD color mode", details: "CMYK 32-bit is not supported" },
      "Unsupported PSD color mode: CMYK 32-bit is not supported",
    ],
    ["a 413 payload too large", 413, { error: "Payload Too Large" }, en.errors.fileTooLarge],
    ["an empty 500 error body", 500, {}, SOURCE_IMAGE_FAILED],
  ])(
    "surfaces %s from the convert route with a toast and reports to Sentry",
    async (_label, status, body, expectedToast) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status,
          json: async () => body,
        })),
      );

      renderEditor();
      await openFileViaMenu(new File(["bad"], "broken.psd"));

      await waitFor(() => expect(toastError).toHaveBeenCalledWith(expectedToast));
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      const [reported, tags] = vi.mocked(captureHandledError).mock.calls[0];
      expect((reported as { statusCode?: number }).statusCode).toBe(status);
      expect(tags).toMatchObject({ error_class: "operational" });
      expect(loadImageSpy).not.toHaveBeenCalled();
    },
  );

  it("toasts sourceImageFailed and reports to Sentry when the convert POST rejects with a network error", async () => {
    const netErr = new TypeError("Failed to fetch");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw netErr;
      }),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "offline.psd"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("surfaces the worker's failure message when a 202 decode fails on the SSE stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-decode-fail", async: true }),
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["exr"], "corrupt.exr"));

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    await act(async () => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "failed",
          error: "Corrupt EXR header",
          details: "missing channels attribute",
        }),
      });
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Corrupt EXR header: missing channels attribute"),
    );
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("toasts timeout and reports to Sentry when a 202 decode stream stalls", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 202,
          json: async () => ({ jobId: "job-open-stall", async: true }),
        })),
      );

      renderEditor();
      await openFileViaMenu(new File(["hdr"], "slow.hdr"));
      expect(FakeEventSource.instances).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(5 * 60_000);
      });

      expect(toastError).toHaveBeenCalledWith(en.errors.timeout);
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      expect(loadImageSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toasts sourceImageFailed and reports to Sentry when the downloadUrl fetch returns non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/tools/image/convert")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ downloadUrl: "/api/v1/download/job-404/out.png" }),
          };
        }
        return {
          ok: false,
          status: 404,
          blob: async () => new Blob([]),
        };
      }),
    );

    renderEditor();
    await openFileViaMenu(new File(["tga"], "missing.tga"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("toasts sourceImageFailed and reports to Sentry when the downloadUrl returns an empty blob", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/tools/image/convert")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ downloadUrl: "/api/v1/download/job-empty/out.png" }),
          };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob([]),
        };
      }),
    );

    renderEditor();
    await openFileViaMenu(new File(["tga"], "empty.tga"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("revokes the blob URL, toasts sourceImageFailed, and reports to Sentry when a server-decoded PNG fails to load in Image", async () => {
    FakeImage.shouldFail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/tools/image/convert")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ downloadUrl: "/api/v1/download/job-bad-png/out.png" }),
          };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["not-a-png"], { type: "image/png" }),
        };
      }),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "bad-output.psd"));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED, {
        id: "editor-source-image-failed",
      }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(tags).toEqual({ error_class: "operational", tool_id: "editor-open" });
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("revokes the blob URL and toasts sourceImageFailed when a client-decoded image fails to load", async () => {
    FakeImage.shouldFail = true;

    renderEditor();
    await openFileViaMenu(new File(["corrupt-png"], "corrupt.png", { type: "image/png" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED, {
        id: "editor-source-image-failed",
      }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("revokes the blob URL and toasts sourceImageFailed when a pasted clipboard image fails to load", async () => {
    FakeImage.shouldFail = true;

    renderEditor();
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => new File(["corrupt"], "paste.png", { type: "image/png" }),
          },
        ],
      },
    });

    await act(async () => {
      document.dispatchEvent(pasteEvent);
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED, {
        id: "editor-source-image-failed",
      }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("reports a malformed 200 response with no downloadUrl and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "missing-url.psd"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [reported, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect((reported as { statusCode?: number }).statusCode).toBe(200);
    expect(tags).toEqual({ error_class: "operational", tool_id: "editor-open" });
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("reports a 200 response whose body is not valid JSON and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token '<'");
        },
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "html-body.psd"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("reports a malformed 202 response with no jobId and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ async: true }),
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["exr"], "no-job.exr"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("reports a malformed completed SSE frame without a downloadUrl under editor-open and toasts invalidResponse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-malformed-open", async: true }),
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["hdr"], "malformed-sse.hdr"));

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    await act(async () => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
      });
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(en.errors.invalidResponse));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(tags).toEqual({ error_class: "operational", tool_id: "editor-open" });
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("falls back to processingFailedNoDetail when a 202 failed SSE frame has no error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-bare-fail-open", async: true }),
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "bare.psd"));

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    await act(async () => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "failed", error: "   " }),
      });
    });

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(en.errors.processingFailedNoDetail),
    );
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("toasts sourceImageFailed and reports to Sentry when EventSource is unavailable", async () => {
    vi.stubGlobal("EventSource", undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-no-es", async: true }),
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "no-es.psd"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("toasts sourceImageFailed and reports to Sentry when EventSource throws on open", async () => {
    vi.stubGlobal(
      "EventSource",
      class {
        constructor() {
          throw new DOMException("Blocked by CSP", "SecurityError");
        }
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-csp-open", async: true }),
      })),
    );

    renderEditor();
    await openFileViaMenu(new File(["psd"], "csp.psd"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("toasts sourceImageFailed and reports to Sentry when the downloadUrl fetch rejects with a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/tools/image/convert")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ downloadUrl: "/api/v1/download/job-net/out.png" }),
          };
        }
        throw new TypeError("Failed to fetch");
      }),
    );

    renderEditor();
    await openFileViaMenu(new File(["tga"], "net-drop.tga"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("toasts sourceImageFailed and reports to Sentry when reading the downloadUrl blob rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/tools/image/convert")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ downloadUrl: "/api/v1/download/job-blob-err/out.png" }),
          };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => {
            throw new TypeError("Stream reset");
          },
        };
      }),
    );

    renderEditor();
    await openFileViaMenu(new File(["tga"], "stream-reset.tga"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED));
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("aborts an in-flight convert POST and suppresses errors when the page unmounts", async () => {
    let signal: AbortSignal | undefined;
    let rejectFetch: (err: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            rejectFetch = reject;
          }),
      ),
    );

    const { unmount } = renderEditor();
    const openPromise = openFileViaMenu(new File(["psd"], "slow-upload.psd"));
    await waitFor(() => expect(signal).toBeDefined());
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
    rejectFetch(new DOMException("Aborted", "AbortError"));
    await openPromise;

    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();
    expect(loadImageSpy).not.toHaveBeenCalled();
  });

  it("closes an in-flight 202 decode stream when the page unmounts or when another document action occurs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-superseded", async: true }),
      })),
    );

    const { unmount } = renderEditor();
    await openFileViaMenu(new File(["psd"], "first.psd"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const firstStream = FakeEventSource.instances[0];
    expect(firstStream.readyState).toBe(FakeEventSource.OPEN);

    // Simulating a store change (e.g. New Document or Restore Autosave) closes the active stream.
    act(() => {
      useEditorStore.setState({
        _historyVersion: useEditorStore.getState()._historyVersion + 1,
      });
    });
    expect(firstStream.readyState).toBe(2);

    // Start a second 202 decode and verify unmount closes it too.
    await openFileViaMenu(new File(["exr"], "second.exr"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    const secondStream = FakeEventSource.instances[1];
    expect(secondStream.readyState).toBe(FakeEventSource.OPEN);

    unmount();
    expect(secondStream.readyState).toBe(2);
    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("revokes a superseded paste blob URL when a newer file is opened before the paste Image settles", async () => {
    FakeImage.manual = true;

    renderEditor();
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => new File(["slow-paste"], "paste.png", { type: "image/png" }),
          },
        ],
      },
    });

    await act(async () => {
      document.dispatchEvent(pasteEvent);
    });
    expect(FakeImage.instances).toHaveLength(1);
    const pastedImg = FakeImage.instances[0];

    await openFileViaMenu(new File(["fast-open"], "second.png", { type: "image/png" }));
    expect(FakeImage.instances).toHaveLength(2);
    const openedImg = FakeImage.instances[1];

    act(() => {
      openedImg.onload?.();
    });
    expect(loadImageSpy).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-2", 320, 240);

    // Now the earlier paste finishes decoding; it must revoke its blob URL and not overwrite.
    act(() => {
      pastedImg.onload?.();
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
    expect(loadImageSpy).toHaveBeenCalledTimes(1);
  });

  it("drops a rebake that was already in flight when File > Open started, without aborting the server-decoded open (#2781)", async () => {
    FakeImage.manual = true;
    useEditorStore.setState({
      sourceImageUrl: "blob:initial",
      sourceImageSize: { width: 800, height: 600 },
      canvasSize: { width: 800, height: 600 },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/tools/image/convert")) {
          return {
            ok: true,
            status: 202,
            json: async () => ({ jobId: "job-after-rotate", async: true }),
          };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["png-bytes"], { type: "image/png" }),
        };
      }),
    );

    renderEditor();

    // Start a rotate on the current document and queue an Image Size behind it.
    const rotating = useEditorStore.getState().rotateCanvas(90);
    const queuedResize = useEditorStore.getState().resizeImage(400, 300);
    expect(FakeImage.instances).toHaveLength(1);
    const rebakeImg = FakeImage.instances[0];

    // While the rotate is still decoding, open a server-decoded .psd file.
    await openFileViaMenu(new File(["psd"], "replacement.psd"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.instances[0];
    expect(stream.readyState).toBe(FakeEventSource.OPEN);

    // Let the earlier rotate finish decoding before the .psd finishes converting.
    await act(async () => {
      rebakeImg.onload?.();
      await expect(rotating).resolves.toBe(false);
      await expect(queuedResize).resolves.toBe(false);
    });

    // Both earlier transforms must be discarded and the in-flight .psd open must stay alive.
    expect(stream.readyState).toBe(FakeEventSource.OPEN);
    expect(useEditorStore.getState().sourceImageUrl).toBe("blob:initial");
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 800, height: 600 });
    expect(toastError).not.toHaveBeenCalled();

    // Now the .psd conversion completes and its decoded PNG finishes loading.
    await act(async () => {
      stream.onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: "/api/v1/download/job-after-rotate/replacement.png" },
        }),
      });
    });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(2));
    act(() => {
      FakeImage.instances[1].onload?.();
    });

    expect(loadImageSpy).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240);
  });

  it("drops a rebake that was already in flight when an image was pasted, without aborting the paste (#2781)", async () => {
    FakeImage.manual = true;
    useEditorStore.setState({
      sourceImageUrl: "blob:initial",
      sourceImageSize: { width: 800, height: 600 },
      canvasSize: { width: 800, height: 600 },
    });

    renderEditor();

    const flipping = useEditorStore.getState().flipCanvasHorizontal();
    expect(FakeImage.instances).toHaveLength(1);
    const rebakeImg = FakeImage.instances[0];

    // Pasting plain text must not cancel the in-flight rebake.
    const textPasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(textPasteEvent, "clipboardData", {
      value: {
        items: [{ type: "text/plain", getAsFile: () => null }],
      },
    });
    await act(async () => {
      document.dispatchEvent(textPasteEvent);
    });

    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: {
        items: [
          {
            type: "image/png",
            getAsFile: () => new File(["pasted-png"], "paste.png", { type: "image/png" }),
          },
        ],
      },
    });
    await act(async () => {
      document.dispatchEvent(pasteEvent);
    });
    expect(FakeImage.instances).toHaveLength(2);
    const pastedImg = FakeImage.instances[1];

    // Earlier flip finishes decoding before the pasted image finishes decoding.
    await act(async () => {
      rebakeImg.onload?.();
      await expect(flipping).resolves.toBe(false);
    });
    expect(useEditorStore.getState().sourceImageUrl).toBe("blob:initial");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    // Pasted image finishes decoding and loads normally.
    act(() => {
      pastedImg.onload?.();
    });
    expect(loadImageSpy).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240);
  });

  it("still cancels an in-flight server-decoded open when a new rebake is triggered after the open started (#2781)", async () => {
    FakeImage.manual = true;
    useEditorStore.setState({
      sourceImageUrl: "blob:initial",
      sourceImageSize: { width: 800, height: 600 },
      canvasSize: { width: 800, height: 600 },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 202,
        json: async () => ({ jobId: "job-superseded-by-rotate", async: true }),
      })),
    );

    renderEditor();
    const preOpenFlip = useEditorStore.getState().flipCanvasHorizontal();
    expect(FakeImage.instances).toHaveLength(1);
    const preOpenRebakeImg = FakeImage.instances[0];

    await openFileViaMenu(new File(["psd"], "slow.psd"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.instances[0];
    expect(stream.readyState).toBe(FakeEventSource.OPEN);

    // User triggers a rotate after starting the open; it runs without waiting on preOpenFlip.
    const rotating = useEditorStore.getState().rotateCanvas(90);
    expect(FakeImage.instances).toHaveLength(2);
    await act(async () => {
      FakeImage.instances[1].onload?.();
      await expect(rotating).resolves.toBe(true);
    });

    expect(stream.readyState).toBe(2);
    expect(useEditorStore.getState().sourceImageUrl).toBe("data:image/png;base64,REBAKED");
    expect(loadImageSpy).not.toHaveBeenCalled();

    await act(async () => {
      preOpenRebakeImg.onload?.();
      await expect(preOpenFlip).resolves.toBe(false);
    });
  });

  it("drops a rebake that was already in flight when a client-decoded image is opened via File > Open (#2781)", async () => {
    FakeImage.manual = true;
    useEditorStore.setState({
      sourceImageUrl: "blob:initial",
      sourceImageSize: { width: 800, height: 600 },
      canvasSize: { width: 800, height: 600 },
    });

    renderEditor();

    const resizing = useEditorStore.getState().resizeCanvas(1000, 800, "center");
    expect(FakeImage.instances).toHaveLength(1);
    const rebakeImg = FakeImage.instances[0];

    await openFileViaMenu(new File(["png"], "photo.png", { type: "image/png" }));
    expect(FakeImage.instances).toHaveLength(2);
    const openedImg = FakeImage.instances[1];

    await act(async () => {
      rebakeImg.onload?.();
      await expect(resizing).resolves.toBe(false);
    });
    expect(useEditorStore.getState().sourceImageUrl).toBe("blob:initial");
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 800, height: 600 });
    expect(toastError).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    act(() => {
      openedImg.onload?.();
    });
    expect(loadImageSpy).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240);
  });

  it("drops a rebake that was already in flight when EditorPage mounts with a ?url= parameter (#2781)", async () => {
    FakeImage.manual = true;
    useEditorStore.setState({
      sourceImageUrl: "blob:initial",
      sourceImageSize: { width: 800, height: 600 },
      canvasSize: { width: 800, height: 600 },
    });

    const rotating = useEditorStore.getState().rotateCanvas(90);
    expect(FakeImage.instances).toHaveLength(1);
    const rebakeImg = FakeImage.instances[0];

    const prevHref = window.location.href;
    window.history.replaceState({}, "", "/editor?url=https%3A%2F%2Fexample.com%2Fnew.png");
    try {
      renderEditor();
      expect(FakeImage.instances).toHaveLength(2);
      const urlImg = FakeImage.instances[1];

      await act(async () => {
        rebakeImg.onload?.();
        await expect(rotating).resolves.toBe(false);
      });
      expect(useEditorStore.getState().sourceImageUrl).toBe("blob:initial");

      act(() => {
        urlImg.onload?.();
      });
      expect(loadImageSpy).toHaveBeenCalledTimes(1);
      expect(loadImageSpy).toHaveBeenCalledWith("https://example.com/new.png", 320, 240);
    } finally {
      window.history.replaceState({}, "", prevHref);
    }
  });
});
