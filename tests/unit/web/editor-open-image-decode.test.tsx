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

import { restoreAutosave } from "@/components/editor/common/export-dialog";
import { WelcomeScreen } from "@/components/editor/common/welcome-screen";
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
      lastAction: { id: "loadImage" },
      _historyVersion: useEditorStore.getState()._historyVersion + 1,
    });
  });
  useEditorStore.setState({
    sourceImageUrl: null,
    sourceImageSize: null,
    canvasSize: { width: 800, height: 600 },
    loadImage: loadImageSpy,
    rulersVisible: false,
    lastAction: { id: "initialState" },
    _historyVersion: 0,
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

async function openFileViaWelcomeButton(file: File) {
  fireEvent.click(screen.getByRole("button", { name: en.editor.welcome.openImageButton }));
  const input = createdInputs[createdInputs.length - 1];
  expect(input).toBeDefined();
  Object.defineProperty(input, "files", {
    value: [file],
    configurable: true,
  });
  await act(async () => {
    await input.onchange?.(new Event("change") as unknown as Event);
  });
  return input;
}

async function dropFileOnWelcomeScreen(file: File) {
  const dropZone = screen.getByRole("region", { name: en.a11y.imageDropZone });
  fireEvent.dragOver(dropZone);
  await act(async () => {
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });
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

  it("surfaces saveFailed toast and reports QuotaExceededError when File > Save fails (#2173)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("indexedDB", undefined);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    });
    useEditorStore.setState({
      sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
      sourceImageSize: { width: 800, height: 600 },
      canvasSize: { width: 800, height: 600 },
    });

    renderEditor();

    fireEvent.click(screen.getByTestId("menu-file"));
    fireEvent.click(screen.getByTestId("menu-item-save"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.autosaveRecovery.saveFailed);
    });
    expect(captureHandledError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Editor autosave exceeded storage quota" }),
      expect.objectContaining({ error_class: "operational", tool_id: "editor-autosave" }),
    );

    toastError.mockClear();
    fireEvent.keyDown(document, { key: "s", code: "KeyS", ctrlKey: true });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(en.editor.ui.autosaveRecovery.saveFailed);
    });
  });

  it("ignores clipboard image paste while a modal dialog is open, including while Canvas Size Apply is decoding (#2795)", async () => {
    FakeImage.manual = true;
    useEditorStore.setState({
      sourceImageUrl: "blob:initial",
      sourceImageSize: { width: 800, height: 600 },
      canvasSize: { width: 800, height: 600 },
    });

    renderEditor();

    const dispatchImagePaste = () => {
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
      document.dispatchEvent(pasteEvent);
      return pasteEvent;
    };

    // 1. Canvas Size dialog open with Apply decoding in flight
    fireEvent.click(screen.getByTestId("menu-image"));
    fireEvent.click(screen.getByTestId("menu-item-canvas-size"));
    const widthInput = screen.getByLabelText(en.editor.ui.widthPx);
    fireEvent.change(widthInput, { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: en.editor.ui.apply }));
    expect(FakeImage.instances).toHaveLength(1);
    const resizeDecodeImg = FakeImage.instances[0];

    let pasteEvent = dispatchImagePaste();
    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(FakeImage.instances).toHaveLength(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(loadImageSpy).not.toHaveBeenCalled();

    // When the Canvas Size decode finishes, the resize commits and closes the dialog.
    await act(async () => {
      resizeDecodeImg.onload?.();
    });
    await waitFor(() => expect(screen.queryByLabelText(en.editor.ui.widthPx)).toBeNull());
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 1000, height: 600 });

    // 2. Image Size dialog open
    fireEvent.click(screen.getByTestId("menu-image"));
    fireEvent.click(screen.getByTestId("menu-item-image-size"));
    expect(screen.getByLabelText(en.editor.ui.widthPx)).toBeInTheDocument();
    pasteEvent = dispatchImagePaste();
    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    expect(screen.queryByLabelText(en.editor.ui.widthPx)).toBeNull();

    // 3. Fill dialog open
    act(() => {
      window.dispatchEvent(new CustomEvent("snapotter:open-fill-dialog"));
    });
    expect(screen.getByRole("dialog", { name: en.a11y.fill })).toBeInTheDocument();
    pasteEvent = dispatchImagePaste();
    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    expect(screen.queryByRole("dialog", { name: en.a11y.fill })).toBeNull();

    // 4. Export dialog open
    fireEvent.click(screen.getByTestId("menu-file"));
    fireEvent.click(screen.getByTestId("menu-item-export-as"));
    expect(screen.getByText(en.editor.ui.exportDialog.heading)).toBeInTheDocument();
    pasteEvent = dispatchImagePaste();
    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.common.close }));
    expect(screen.queryByText(en.editor.ui.exportDialog.heading)).toBeNull();

    // 5. New Document dialog open
    fireEvent.click(screen.getByTestId("menu-file"));
    fireEvent.click(screen.getByTestId("menu-item-new"));
    expect(screen.getByText(en.editor.ui.newDocument.heading)).toBeInTheDocument();
    pasteEvent = dispatchImagePaste();
    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
    expect(screen.queryByText(en.editor.ui.newDocument.heading)).toBeNull();

    // Once all dialogs are closed, pasting an image loads normally.
    await act(async () => {
      pasteEvent = dispatchImagePaste();
    });
    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(FakeImage.instances).toHaveLength(2);
    act(() => {
      FakeImage.instances[1].onload?.();
    });
    expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240);
  });

  it("closes open Canvas Size, Image Size, and Fill modals when a replacement image loads (#2795)", async () => {
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
            json: async () => ({ jobId: "job-close-modals", async: true }),
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

    // Start a 202 server-decoded open while the previous image is still displayed.
    await openFileViaMenu(new File(["psd"], "incoming.psd"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const stream = FakeEventSource.instances[0];

    // User opens Canvas Size (and starts Apply decode) and Fill dialogs while waiting for the server decode.
    fireEvent.click(screen.getByTestId("menu-image"));
    fireEvent.click(screen.getByTestId("menu-item-canvas-size"));
    fireEvent.change(screen.getByLabelText(en.editor.ui.widthPx), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: en.editor.ui.apply }));
    expect(FakeImage.instances).toHaveLength(1);
    const resizeDecodeImg = FakeImage.instances[0];
    act(() => {
      window.dispatchEvent(new CustomEvent("snapotter:open-fill-dialog"));
    });
    expect(screen.getByLabelText(en.editor.ui.widthPx)).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: en.a11y.fill })).toBeInTheDocument();

    // The server-decoded image finishes and calls loadImage while Canvas Size Apply is still decoding.
    await act(async () => {
      stream.onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: "/api/v1/download/job-close-modals/incoming.png" },
        }),
      });
    });
    await waitFor(() => expect(FakeImage.instances).toHaveLength(2));
    await act(async () => {
      FakeImage.instances[1].onload?.();
      resizeDecodeImg.onload?.();
    });

    expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240);
    expect(useEditorStore.getState().canvasSize).toEqual({ width: 320, height: 240 });
    expect(screen.queryByLabelText(en.editor.ui.widthPx)).toBeNull();
    expect(screen.queryByRole("dialog", { name: en.a11y.fill })).toBeNull();
    expect(toastError).not.toHaveBeenCalled();

    // Also verify Image Size, Export, and New Document close when the document is replaced or closed via the store,
    // while undoing an in-document edit back to a loadImage history snapshot keeps modals open and undoing a
    // document replacement itself closes open modals.
    fireEvent.click(screen.getByTestId("menu-image"));
    fireEvent.click(screen.getByTestId("menu-item-image-size"));
    expect(screen.getByLabelText(en.editor.ui.widthPx)).toBeInTheDocument();
    act(() => {
      useEditorStore.setState({
        lastAction: { id: "addObject", objectType: "rect" },
        _historyVersion: useEditorStore.getState()._historyVersion + 1,
      });
      useEditorStore.setState({
        lastAction: { id: "loadImage" },
        _historyVersion: useEditorStore.getState()._historyVersion - 1,
      });
    });
    expect(screen.getByLabelText(en.editor.ui.widthPx)).toBeInTheDocument();
    act(() => {
      useEditorStore.setState({
        sourceImageUrl: "blob:previous-doc",
        sourceImageSize: { width: 800, height: 600 },
        canvasSize: { width: 800, height: 600 },
        lastAction: { id: "initialState" },
        _historyVersion: useEditorStore.getState()._historyVersion - 1,
      });
    });
    expect(screen.queryByLabelText(en.editor.ui.widthPx)).toBeNull();

    fireEvent.click(screen.getByTestId("menu-image"));
    fireEvent.click(screen.getByTestId("menu-item-image-size"));
    expect(screen.getByLabelText(en.editor.ui.widthPx)).toBeInTheDocument();
    act(() => {
      restoreAutosave({
        version: 1,
        timestamp: Date.now(),
        state: {
          canvasSize: { width: 640, height: 480 },
          layers: useEditorStore.getState().layers,
          objects: [],
          adjustments: useEditorStore.getState().adjustments,
          filters: useEditorStore.getState().filters,
          levels: useEditorStore.getState().levels,
          curves: useEditorStore.getState().curves,
          guides: [],
          sourceImageUrl: "data:image/png;base64,iVBORw0KGgo=",
          sourceImageSize: { width: 640, height: 480 },
          foregroundColor: "#000000",
          backgroundColor: "#ffffff",
        },
      });
    });
    expect(screen.queryByLabelText(en.editor.ui.widthPx)).toBeNull();

    fireEvent.click(screen.getByTestId("menu-file"));
    fireEvent.click(screen.getByTestId("menu-item-export-as"));
    expect(screen.getByText(en.editor.ui.exportDialog.heading)).toBeInTheDocument();
    act(() => {
      loadImageSpy("blob:direct-load", 400, 300);
    });
    expect(screen.queryByText(en.editor.ui.exportDialog.heading)).toBeNull();

    fireEvent.click(screen.getByTestId("menu-file"));
    fireEvent.click(screen.getByTestId("menu-item-new"));
    expect(screen.getByText(en.editor.ui.newDocument.heading)).toBeInTheDocument();
    act(() => {
      useEditorStore.setState({
        sourceImageUrl: "blob:project",
        sourceImageSize: { width: 500, height: 400 },
        canvasSize: { width: 500, height: 400 },
        lastAction: { id: "loadProject" },
        _historyVersion: useEditorStore.getState()._historyVersion + 1,
      });
    });
    expect(screen.queryByText(en.editor.ui.newDocument.heading)).toBeNull();

    fireEvent.click(screen.getByTestId("menu-image"));
    fireEvent.click(screen.getByTestId("menu-item-canvas-size"));
    expect(screen.getByLabelText(en.editor.ui.widthPx)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("menu-file"));
    fireEvent.click(screen.getByTestId("menu-item-close"));
    expect(screen.queryByLabelText(en.editor.ui.widthPx)).toBeNull();
  });

  it("closes an open modal when a ?url= query-parameter image finishes decoding (#2795)", () => {
    FakeImage.manual = true;
    const prevHref = window.location.href;
    window.history.replaceState({}, "", "/editor?url=https%3A%2F%2Fexample.com%2Fquery.png");
    try {
      renderEditor();
      expect(FakeImage.instances).toHaveLength(1);
      const urlImg = FakeImage.instances[0];

      fireEvent.click(screen.getByTestId("menu-image"));
      fireEvent.click(screen.getByTestId("menu-item-canvas-size"));
      expect(screen.getByLabelText(en.editor.ui.widthPx)).toBeInTheDocument();

      act(() => {
        urlImg.onload?.();
      });

      expect(loadImageSpy).toHaveBeenCalledWith("https://example.com/query.png", 320, 240);
      expect(screen.queryByLabelText(en.editor.ui.widthPx)).toBeNull();
    } finally {
      window.history.replaceState({}, "", prevHref);
    }
  });

  describe("WelcomeScreen file intake (#2552)", () => {
    it.each(["psd", "tga", "exr", "hdr"] as const)(
      "accepts .%s in the welcome Open Image file picker and decodes it via the server",
      async (ext) => {
        const store = new Map<string, string>([["snapotter-token", "tok-welcome-open"]]);
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
                json: async () => ({ downloadUrl: `/api/v1/download/job-welcome-${ext}/out.png` }),
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
        const input = await openFileViaWelcomeButton(
          new File(["raw"], `welcome.${ext}`, { type: "application/octet-stream" }),
        );
        expect(input.accept).toContain(`.${ext}`);

        await waitFor(() => expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240));
        expect(toastError).not.toHaveBeenCalled();
        expect(fetchCalls).toHaveLength(2);
        expect(fetchCalls[0].headers?.get("Authorization")).toBe("Bearer tok-welcome-open");
        expect(fetchCalls[1].headers?.get("Authorization")).toBe("Bearer tok-welcome-open");
      },
    );

    it.each(["psd", "tga", "exr", "hdr"] as const)(
      "decodes a dropped .%s file via the server including 202 SSE progress",
      async (ext) => {
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url: string) => {
            if (url.includes("/tools/image/convert")) {
              return {
                ok: true,
                status: 202,
                json: async () => ({ jobId: `job-drop-${ext}`, async: true }),
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
        await dropFileOnWelcomeScreen(new File(["raw"], `dropped.${ext}`, { type: "" }));

        await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
        const es = FakeEventSource.instances[0];
        expect(es.url).toBe(`/api/v1/jobs/job-drop-${ext}/progress`);

        await act(async () => {
          es.onmessage?.({
            data: JSON.stringify({
              type: "single",
              phase: "complete",
              result: { downloadUrl: `/api/v1/download/job-drop-${ext}/dropped.png` },
            }),
          });
        });

        await waitFor(() => expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-1", 320, 240));
        expect(toastError).not.toHaveBeenCalled();
      },
    );

    it("surfaces a server error toast when a dropped .psd fails server conversion", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 422,
          json: async () => ({
            error: "Unsupported PSD color mode",
            details: "Lab color is not supported",
          }),
        })),
      );

      renderEditor();
      await dropFileOnWelcomeScreen(new File(["bad-psd"], "lab.psd"));

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          "Unsupported PSD color mode: Lab color is not supported",
        ),
      );
      expect(captureHandledError).toHaveBeenCalledTimes(1);
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it("revokes the blob URL and toasts sourceImageFailed when a corrupt image is chosen via the welcome Open Image button", async () => {
      FakeImage.shouldFail = true;

      renderEditor();
      await openFileViaWelcomeButton(new File(["corrupt"], "corrupt.png", { type: "image/png" }));

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED, {
          id: "editor-source-image-failed",
        }),
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
      expect(captureHandledError).not.toHaveBeenCalled();
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it("revokes the blob URL and toasts sourceImageFailed when a corrupt image is dropped on the welcome screen", async () => {
      FakeImage.shouldFail = true;

      renderEditor();
      await dropFileOnWelcomeScreen(new File(["corrupt"], "corrupt.png", { type: "" }));

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED, {
          id: "editor-source-image-failed",
        }),
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
      expect(captureHandledError).not.toHaveBeenCalled();
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it("revokes the blob URL and toasts sourceImageFailed when a standalone WelcomeScreen fails to decode an image", async () => {
      FakeImage.shouldFail = true;

      render(<WelcomeScreen />);
      await dropFileOnWelcomeScreen(new File(["corrupt"], "standalone.png", { type: "image/png" }));

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(SOURCE_IMAGE_FAILED, {
          id: "editor-source-image-failed",
        }),
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
      expect(loadImageSpy).not.toHaveBeenCalled();
    });

    it("loads a valid image in standalone WelcomeScreen, handles dragLeave and empty drops, and revokes superseded blob URLs", async () => {
      FakeImage.manual = true;
      const { unmount } = render(<WelcomeScreen />);
      const dropZone = screen.getByRole("region", { name: en.a11y.imageDropZone });

      fireEvent.dragOver(dropZone);
      fireEvent.dragLeave(dropZone);
      fireEvent.drop(dropZone, { dataTransfer: { files: [] } });
      expect(loadImageSpy).not.toHaveBeenCalled();

      // First slow file dropped on standalone WelcomeScreen
      await dropFileOnWelcomeScreen(new File(["png-1"], "first.png", { type: "" }));
      expect(FakeImage.instances).toHaveLength(1);
      const firstImg = FakeImage.instances[0];

      // Second file chosen via the Open Image button supersedes the first
      await openFileViaWelcomeButton(new File(["png-2"], "second.png", { type: "image/png" }));
      expect(FakeImage.instances).toHaveLength(2);
      const secondImg = FakeImage.instances[1];

      act(() => {
        secondImg.onload?.();
      });
      expect(loadImageSpy).toHaveBeenCalledTimes(1);
      expect(loadImageSpy).toHaveBeenCalledWith("blob:opened-2", 320, 240);

      // Earlier image finishes decoding after being superseded: revokes its blob URL without overwriting
      act(() => {
        firstImg.onload?.();
      });
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:opened-1");
      expect(loadImageSpy).toHaveBeenCalledTimes(1);

      unmount();
      expect(toastError).not.toHaveBeenCalled();
    });

    it("cancels an in-flight WelcomeScreen 202 decode when another file is dropped or New Document is created before it finishes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 202,
          json: async () => ({ jobId: "job-welcome-superseded", async: true }),
        })),
      );

      renderEditor();
      await dropFileOnWelcomeScreen(new File(["psd"], "slow.psd"));
      await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
      const firstStream = FakeEventSource.instances[0];
      expect(firstStream.readyState).toBe(FakeEventSource.OPEN);

      // Dropping another .psd closes the first stream and starts a second
      await dropFileOnWelcomeScreen(new File(["psd"], "second.psd"));
      expect(firstStream.readyState).toBe(2);
      await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
      const secondStream = FakeEventSource.instances[1];
      expect(secondStream.readyState).toBe(FakeEventSource.OPEN);

      // Creating a New Document from the welcome screen closes the second stream and loads the blank canvas
      fireEvent.click(screen.getByRole("button", { name: en.editor.welcome.newDocumentButton }));
      fireEvent.click(screen.getByRole("button", { name: en.common.create }));
      expect(secondStream.readyState).toBe(2);
      expect(loadImageSpy).toHaveBeenCalledWith("data:image/png;base64,REBAKED", 1920, 1080);
      expect(toastError).not.toHaveBeenCalled();
    });

    it("delegates WelcomeScreen New Document to EditorPage's single NewDocumentDialog so paste is blocked, File > New does not stack a second dialog, and store replacement closes it (#3270)", () => {
      FakeImage.manual = true;
      renderEditor();

      fireEvent.click(screen.getByRole("button", { name: en.editor.welcome.newDocumentButton }));
      expect(
        screen.getAllByRole("heading", { name: en.editor.ui.newDocument.heading }),
      ).toHaveLength(1);
      expect(document.querySelectorAll("#new-doc-preset")).toHaveLength(1);

      // Pasting an image while the welcome-opened New Document dialog is open is ignored.
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
      document.dispatchEvent(pasteEvent);
      expect(pasteEvent.defaultPrevented).toBe(false);
      expect(FakeImage.instances).toHaveLength(0);
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(loadImageSpy).not.toHaveBeenCalled();

      // Clicking File > New while the dialog is already open does not mount a second NewDocumentDialog.
      fireEvent.click(screen.getByTestId("menu-file"));
      fireEvent.click(screen.getByTestId("menu-item-new"));
      expect(
        screen.getAllByRole("heading", { name: en.editor.ui.newDocument.heading }),
      ).toHaveLength(1);
      expect(document.querySelectorAll("#new-doc-preset")).toHaveLength(1);
      expect(document.querySelectorAll("#new-doc-width")).toHaveLength(1);
      expect(document.querySelectorAll("#new-doc-height")).toHaveLength(1);

      // Replacing the document via the store closes the dialog via closeDocumentModals().
      act(() => {
        useEditorStore.setState({
          sourceImageUrl: "blob:project",
          sourceImageSize: { width: 500, height: 400 },
          canvasSize: { width: 500, height: 400 },
          lastAction: { id: "loadProject" },
          _historyVersion: useEditorStore.getState()._historyVersion + 1,
        });
      });
      expect(screen.queryByRole("heading", { name: en.editor.ui.newDocument.heading })).toBeNull();
    });

    it("opens and closes its fallback NewDocumentDialog when WelcomeScreen is rendered standalone without onNewDocument (#3270)", () => {
      render(<WelcomeScreen />);

      fireEvent.click(screen.getByRole("button", { name: en.editor.welcome.newDocumentButton }));
      expect(
        screen.getByRole("heading", { name: en.editor.ui.newDocument.heading }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: en.common.cancel }));
      expect(screen.queryByRole("heading", { name: en.editor.ui.newDocument.heading })).toBeNull();
    });
  });
});
