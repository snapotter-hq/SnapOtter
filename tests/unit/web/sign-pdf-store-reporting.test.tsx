// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { SignPlacement } from "@snapotter/shared";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import type { SignCanvasRef } from "@/components/tools/sign-canvas";
import { SignPdfSettings } from "@/components/tools/sign-pdf-settings";
import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { captureHandledError } from "@/lib/analytics";
import { useFileStore } from "@/stores/file-store";

/**
 * sign-pdf hand-rolls its request, so nothing in useToolProcessor reports the
 * run for it. These pin the reporting the navigation guard reads: the store's
 * processing flag while the sign runs, and a result on the entry the run
 * started against once it lands.
 */

const DOWNLOAD_URL = "/api/v1/download/job-1/contract_signed.pdf";

class FakeEventSource {
  static OPEN = 1;
  static instances: FakeEventSource[] = [];

  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  close() {
    this.readyState = 2;
  }
}

class FakeXhr {
  static instances: FakeXhr[] = [];

  timeout = 0;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  url = "";
  body: FormData | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(_key: string, _value: string) {}

  send(body: FormData) {
    this.body = body;
  }

  /** Answer the request the way the API does for a fast sign. */
  respond(status: number, body: unknown) {
    act(() => {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    });
  }
}

const PLACEMENT: SignPlacement = { sig: 0, page: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.1 };

function fakeCanvas(overrides: Partial<SignCanvasRef> = {}): SignCanvasRef {
  return {
    addSignature: vi.fn(),
    deleteSelected: vi.fn(),
    hasPlacements: () => true,
    exportPlacements: async () => ({
      pngs: [new Blob(["png"], { type: "image/png" })],
      placements: [PLACEMENT],
    }),
    ...overrides,
  };
}

function renderPanel(canvas: SignCanvasRef = fakeCanvas()) {
  return render(
    <SignPdfSettings
      signProps={{ canvasRef: { current: canvas }, hasSelection: false, placementCount: 1 }}
    />,
  );
}

/** Click Apply and wait for the request the handler fires after its export. */
async function apply(): Promise<FakeXhr> {
  fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
  await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
  return FakeXhr.instances[0];
}

function pdf(name: string): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

function entry(index = 0) {
  return useFileStore.getState().entries[index];
}

/** What the navigation guard makes of the store, on the sign-pdf route. */
function guardWork() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/pdf/sign-pdf"]}>{children}</MemoryRouter>
  );
  return renderHook(() => useWorkInFlight(), { wrapper }).result.current;
}

/** jsdom has no navigation, so let the click run but drop the default action. */
function swallowNavigation(e: Event) {
  e.preventDefault();
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  document.addEventListener("click", swallowNavigation, true);
  FakeXhr.instances = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(captureHandledError).mockClear();
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([pdf("contract.pdf")]);
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation, true);
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.getState().reset();
});

describe("sign-pdf reports its run to the file store", () => {
  it("flips the store's processing flag for the length of the run", async () => {
    renderPanel();

    const xhr = await apply();
    expect(useFileStore.getState().processing).toBe(true);

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(useFileStore.getState().processing).toBe(false);
  });

  it("lands the signed result on the entry, unclaimed", async () => {
    renderPanel();

    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(entry().status).toBe("completed");
    expect(entry().claimed).toBe(false);
  });

  it("names the result the way the server named it", async () => {
    renderPanel();

    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(entry().processedFilename).toBe("contract_signed.pdf");
  });

  // tool-page renders its ReviewPanel on `hasProcessed && processedSize != null`,
  // and this panel already offers the signed PDF. Filling in the size would put
  // a second download button beside this tool's own.
  it("leaves processedSize alone so no second download panel appears", async () => {
    renderPanel();

    (await apply()).respond(200, {
      downloadUrl: DOWNLOAD_URL,
      originalSize: 1000,
      processedSize: 1200,
    });

    expect(entry().processedSize).toBeNull();
  });

  it("takes the result off the entry when a second run starts", async () => {
    renderPanel();
    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
    act(() => useFileStore.getState().markClaimed(0));

    // The panel swaps to its download link on success, so drive the second run
    // through the store the way a fresh panel would see it.
    FakeXhr.instances = [];
    cleanup();
    renderPanel();
    await apply();

    expect(entry().processedUrl).toBeNull();
    expect(entry().claimed).toBe(false);
  });

  it("claims the entry when the result auto-saved to the library", async () => {
    renderPanel();

    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL, savedFileId: "file-9" });

    expect(entry().claimed).toBe(true);
  });

  // The thumbnail strip is not gated on the run, so the selection can move
  // while the PDF is being signed. A result written to the live selection would
  // land on a bystander entry and the signed file would go unguarded.
  it("lands the result on the entry the run started against", async () => {
    useFileStore.getState().setFiles([pdf("contract.pdf"), pdf("other.pdf")]);
    renderPanel();

    const xhr = await apply();
    act(() => useFileStore.getState().setSelectedIndex(1));
    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(entry(0).processedUrl).toBe(DOWNLOAD_URL);
    expect(entry(1).processedUrl).toBeNull();
  });
});

describe("sign-pdf clears the store's processing flag on every exit path", () => {
  it("clears it when the request fails", async () => {
    renderPanel();

    (await apply()).respond(422, { error: "Processing failed" });

    expect(useFileStore.getState().processing).toBe(false);
    expect(entry().processedUrl).toBeNull();
  });

  it("clears it on a network error", async () => {
    renderPanel();

    const xhr = await apply();
    act(() => xhr.onerror?.());

    expect(useFileStore.getState().processing).toBe(false);
  });

  it("clears it when the request times out", async () => {
    renderPanel();

    const xhr = await apply();
    act(() => xhr.ontimeout?.());

    expect(useFileStore.getState().processing).toBe(false);
  });

  it("clears it when the signatures cannot be exported", async () => {
    renderPanel(
      fakeCanvas({
        exportPlacements: () => Promise.reject(new Error("canvas is tainted")),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(FakeXhr.instances).toHaveLength(0);
    // Catching the rejection takes it out of Sentry's global handler, so the
    // panel has to report it itself.
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Signature export failed" }),
      expect.objectContaining({ tool_id: "sign-pdf" }),
    );
  });
});

describe("sign-pdf settles once when both answers arrive", () => {
  // A fast sign answers twice: waitForJob returns 200 and the worker has
  // already published the terminal SSE frame. Any patch touching processedUrl
  // clears the claim (the store invariant), so a second write would un-take a
  // result the user took in between and the guard would warn about it.
  it("keeps a claim made between the two answers", async () => {
    renderPanel();

    const xhr = await apply();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: DOWNLOAD_URL },
        }),
      });
    });
    // The user takes the signed PDF before the sync response arrives.
    act(() => useFileStore.getState().markClaimed(0));

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(entry().claimed).toBe(true);
  });

  it("lands the async result through the progress stream", async () => {
    renderPanel();

    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: DOWNLOAD_URL },
        }),
      });
    });

    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("clears the processing flag when the stream reports a failure", async () => {
    renderPanel();

    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "failed", error: "sidecar died" }),
      });
    });

    expect(useFileStore.getState().processing).toBe(false);
    expect(entry().processedUrl).toBeNull();
  });
});

describe("the navigation guard sees a sign end to end", () => {
  it("warns while it runs, offers the signed pdf, then goes quiet when it is taken", async () => {
    renderPanel();

    const xhr = await apply();
    expect(guardWork()).toEqual({ kind: "processing" });

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });
    // A non-empty download list is what puts "Download, then leave" in the
    // dialog, instead of the warn-only pair the own-store tools get.
    expect(guardWork()).toEqual({
      kind: "unsaved",
      downloads: [{ kind: "result", index: 0, url: DOWNLOAD_URL, filename: "contract_signed.pdf" }],
    });

    fireEvent.click(screen.getByRole("link", { name: /download signed pdf/i }));

    expect(guardWork()).toBeNull();
  });
});
