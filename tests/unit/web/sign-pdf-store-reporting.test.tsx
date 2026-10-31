// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en, type SignPlacement } from "@snapotter/shared";
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
import * as signatureStore from "@/lib/signature-store";
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
  aborted = false;
  /** The browser's upload channel: progress events while the body is sent. */
  upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  /** A browser sends no upload events to a handler attached after send(). */
  uploadHandlerAtSend = false;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(_key: string, _value: string) {}

  send(body: FormData) {
    this.body = body;
    this.uploadHandlerAtSend = this.upload.onprogress !== null;
  }

  /** As the real one does: no load event ever fires after this. */
  abort() {
    this.aborted = true;
  }

  /** The browser finished sending the body; the server hasn't answered yet. */
  uploadFinished() {
    act(() => {
      this.upload.onload?.();
    });
  }

  /** Report upload bytes moving, as the browser does while the PDF is sent. */
  uploadProgress(loaded: number, total: number) {
    act(() => {
      this.upload.onprogress?.(
        new ProgressEvent("progress", { loaded, total, lengthComputable: true }),
      );
    });
  }

  /** Answer the request the way the API does for a fast sign. */
  respond(status: number, body: unknown) {
    if (this.aborted) return;
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

function renderPanel(canvas: SignCanvasRef = fakeCanvas(), hasSelection = false) {
  return render(
    <SignPdfSettings
      signProps={{ canvasRef: { current: canvas }, hasSelection, placementCount: 1 }}
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
  // Unmounting mid-run asks the server to cancel an accepted job (#2313); no server here.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ canceled: true }))),
  );
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
    renderPanel(fakeCanvas(), true);
    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
    act(() => useFileStore.getState().markClaimed(0));

    // Editing placements swaps the panel back from its download link to Apply
    // while the previous result and claim are still on the entry.
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(entry().claimed).toBe(true);

    FakeXhr.instances = [];
    await apply();

    expect(entry().processedUrl).toBeNull();
    expect(entry().claimed).toBe(false);
  });

  it("swaps back to Apply when placing a saved signature after a completed run", async () => {
    const listSpy = vi
      .spyOn(signatureStore, "listSignatures")
      .mockReturnValue([{ id: "sig-1", dataUrl: "data:image/png;base64,sig", createdAt: 1 }]);
    try {
      renderPanel();
      (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
      expect(screen.getByRole("link", { name: /download signed pdf/i })).toBeInTheDocument();

      const savedSigImg = screen.getByAltText(/saved signature/i);
      fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);

      expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
    } finally {
      listSpy.mockRestore();
    }
  });

  it("swaps back to Apply when saving a new signature from the pad after a completed run", async () => {
    renderPanel();
    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
    expect(screen.getByRole("link", { name: /download signed pdf/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\+ new/i }));
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));
    const fileInput = document.querySelector(
      'input[accept="image/png,image/jpeg"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["png"], "sig.png", { type: "image/png" })] },
    });
    const saveBtn = await screen.findByRole("button", { name: /save & place/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    fireEvent.click(saveBtn);

    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
  });

  it("hides localDownload when controlled staleEntryId matches the active entry and clears it on re-sign (#2535)", async () => {
    const secondUrl = "/api/v1/download/job-2/contract_signed.pdf";
    const canvas = fakeCanvas();
    let currentStaleId: string | null = null;
    const onStaleEntryChange = vi.fn((next: string | null) => {
      currentStaleId = next;
    });
    const view = render(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: canvas },
          hasSelection: true,
          placementCount: 1,
          staleEntryId: currentStaleId,
          onStaleEntryChange,
        }}
      />,
    );

    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
    expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
      "href",
      DOWNLOAD_URL,
    );

    // SignCanvas fires onPlacementsChange on dragend/transformend, which updates
    // ToolPage's signStaleEntryId while SignPdfSettings still holds localDownload.
    currentStaleId = entry().id;
    view.rerender(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: canvas },
          hasSelection: true,
          placementCount: 1,
          staleEntryId: currentStaleId,
          onStaleEntryChange,
        }}
      />,
    );
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();

    // Re-signing clears staleEntryId via onStaleEntryChange(null) and shows the new download link.
    FakeXhr.instances = [];
    const secondXhr = await apply();
    expect(onStaleEntryChange).toHaveBeenCalledWith(null);
    view.rerender(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: canvas },
          hasSelection: true,
          placementCount: 1,
          staleEntryId: currentStaleId,
          onStaleEntryChange,
        }}
      />,
    );
    secondXhr.respond(200, { downloadUrl: secondUrl });

    expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
      "href",
      secondUrl,
    );
  });

  it("keeps Apply & Download visible when a saved signature is placed while a sign request is in flight (#3100)", async () => {
    const secondUrl = "/api/v1/download/job-2/contract_signed.pdf";
    const listSpy = vi
      .spyOn(signatureStore, "listSignatures")
      .mockReturnValue([{ id: "sig-1", dataUrl: "data:image/png;base64,sig", createdAt: 1 }]);
    try {
      renderPanel();
      const firstXhr = await apply();

      // Edit placements while the sign request is still in flight.
      const savedSigImg = screen.getByAltText(/saved signature/i);
      fireEvent.click(savedSigImg.closest("button") as HTMLButtonElement);

      firstXhr.respond(200, { downloadUrl: DOWNLOAD_URL });

      expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);

      // Re-signing clears the stale state and shows the new download link.
      FakeXhr.instances = [];
      (await apply()).respond(200, { downloadUrl: secondUrl });
      expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
        "href",
        secondUrl,
      );
    } finally {
      listSpy.mockRestore();
    }
  });

  it("keeps Apply & Download visible when deleting a selected signature while an async sign request is in flight (#3100)", async () => {
    let currentStaleId: string | null = null;
    const onStaleEntryChange = vi.fn((next: string | null) => {
      currentStaleId = next;
    });
    const canvas = fakeCanvas();
    const view = render(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: canvas },
          hasSelection: true,
          placementCount: 1,
          staleEntryId: currentStaleId,
          onStaleEntryChange,
        }}
      />,
    );

    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });

    // Deleting the selected signature mid-run notifies onStaleEntryChange.
    fireEvent.click(screen.getByRole("button", { name: /✕ delete/i }));
    expect(onStaleEntryChange).toHaveBeenCalledWith(entry().id);
    view.rerender(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: canvas },
          hasSelection: false,
          placementCount: 1,
          staleEntryId: currentStaleId,
          onStaleEntryChange,
        }}
      />,
    );

    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: DOWNLOAD_URL },
        }),
      });
    });

    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();

    // A failed re-sign clears signingEntryIdRef on teardown so a subsequent edit
    // on the unsigned entry does not re-mark it stale.
    FakeXhr.instances = [];
    onStaleEntryChange.mockClear();
    (await apply()).respond(422, { error: "Processing failed" });
    expect(onStaleEntryChange).toHaveBeenCalledWith(null);
    onStaleEntryChange.mockClear();
    view.rerender(
      <SignPdfSettings
        signProps={{
          canvasRef: { current: canvas },
          hasSelection: true,
          placementCount: 1,
          staleEntryId: currentStaleId,
          onStaleEntryChange,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /✕ delete/i }));
    expect(onStaleEntryChange).not.toHaveBeenCalled();
  });

  it("keeps Apply & Download visible when saving a new signature from the pad while a sign request is in flight (#3100)", async () => {
    renderPanel();
    const xhr = await apply();

    fireEvent.click(screen.getByRole("button", { name: /\+ new/i }));
    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));
    const fileInput = document.querySelector(
      'input[accept="image/png,image/jpeg"]',
    ) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["png"], "sig.png", { type: "image/png" })] },
    });
    const saveBtn = await screen.findByRole("button", { name: /save & place/i });
    await waitFor(() => expect(saveBtn).toBeEnabled());
    fireEvent.click(saveBtn);

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
  });

  it("scopes the download link, error, and edited state to the selected entry", async () => {
    useFileStore.getState().setFiles([pdf("contract.pdf"), pdf("lease.pdf")]);
    renderPanel(fakeCanvas(), true);

    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
    expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
      "href",
      DOWNLOAD_URL,
    );

    // Selecting the second, unsigned PDF hides the first PDF's download link.
    act(() => useFileStore.getState().setSelectedIndex(1));
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();

    // Failing the second PDF shows its error on entry 1 only.
    FakeXhr.instances = [];
    (await apply()).respond(422, { error: "Processing failed" });
    expect(screen.getByText("Processing failed")).toBeInTheDocument();

    // Switching back to entry 0 restores its download link without entry 1's error.
    act(() => useFileStore.getState().setSelectedIndex(0));
    expect(screen.queryByText("Processing failed")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
      "href",
      DOWNLOAD_URL,
    );

    // Replacing the file set clears the old entry's download link and error while mounted.
    act(() => useFileStore.getState().setFiles([pdf("fresh.pdf")]));
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Processing failed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
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

/**
 * #1969: a failed sign used to leave its entry at "pending" with no error, so
 * the thumbnail strip never marked it failed and the page's report-issue
 * button never showed. Every failure path now writes the failure to the entry
 * the run started on, with a category wherever the message is translated and
 * couldn't be classified from its text.
 */
describe("sign-pdf marks its entry failed on every failure path", () => {
  const sp = en.toolSettings["sign-pdf"];

  it("marks it failed with the server's error when the request fails", async () => {
    renderPanel();

    (await apply()).respond(422, { error: "Processing failed" });

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe("Processing failed");
    expect(entry().errorCategory).toBeNull();
  });

  it("marks it failed with the status when the error body has no message", async () => {
    renderPanel();

    (await apply()).respond(500, {});

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.failedWithStatus.replace("{status}", "500"));
  });

  it("marks it failed on a network error", async () => {
    renderPanel();

    const xhr = await apply();
    act(() => xhr.onerror?.());

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.network);
    expect(entry().errorCategory).toBe("upload_error");
  });

  it("marks it failed when the request times out", async () => {
    renderPanel();

    const xhr = await apply();
    act(() => xhr.ontimeout?.());

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(sp.timeout);
    expect(entry().errorCategory).toBe("timeout");
  });

  it("marks it failed when the signatures cannot be exported", async () => {
    renderPanel(
      fakeCanvas({
        exportPlacements: () => Promise.reject(new Error("canvas is tainted")),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));

    await waitFor(() => expect(entry().status).toBe("failed"));
    expect(entry().error).toBe(sp.exportFailed);
    expect(entry().errorCategory).toBe("processing_error");
  });

  it("marks it failed when a 200's body does not parse", async () => {
    renderPanel();
    const xhr = await apply();

    act(() => {
      xhr.status = 200;
      xhr.responseText = "<html>not json</html>";
      xhr.onload?.();
    });

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.invalidResponse);
    // "Invalid response" would read as the user's validation error from its
    // English text, and as something else in every other locale.
    expect(entry().errorCategory).toBe("processing_error");
  });

  it("files a proxy's 413 under upload_error", async () => {
    renderPanel();
    const xhr = await apply();

    act(() => {
      xhr.status = 413;
      xhr.responseText = "<html>413 Request Entity Too Large</html>";
      xhr.onload?.();
    });

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.fileTooLarge);
    expect(entry().errorCategory).toBe("upload_error");
  });

  it("marks it failed when the stream reports a failure", async () => {
    renderPanel();

    (await apply()).respond(202, { jobId: "job-1", async: true });
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(FAILED_FRAME) });
    });

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe("sidecar died");
    // The server's own text is English and classifies from its words.
    expect(entry().errorCategory).toBeNull();
  });

  it("files a streamed result with no download URL under processing_error", async () => {
    renderPanel();

    (await apply()).respond(202, { jobId: "job-1", async: true });
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
      });
    });

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.invalidResponse);
    expect(entry().errorCategory).toBe("processing_error");
  });

  it("marks it failed when the stream stalls", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();

      (await apply()).respond(202, { jobId: "job-1", async: true });
      stalls.fireLatest();

      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(sp.stall);
      expect(entry().errorCategory).toBe("timeout");
    } finally {
      stalls.restore();
    }
  });

  it("marks the entry the run started against, not the live selection", async () => {
    useFileStore.getState().setFiles([pdf("contract.pdf"), pdf("lease.pdf")]);
    renderPanel();

    const xhr = await apply();
    act(() => useFileStore.getState().setSelectedIndex(1));
    xhr.respond(422, { error: "Processing failed" });

    expect(entry(0).status).toBe("failed");
    expect(entry(1).status).toBe("pending");
    expect(entry(1).error).toBeNull();
  });

  it("clears the failure when the next run starts", async () => {
    renderPanel();

    (await apply()).respond(422, { error: "Processing failed" });
    expect(entry().status).toBe("failed");

    fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));

    expect(entry().status).toBe("pending");
    expect(entry().error).toBeNull();
    expect(entry().errorCategory).toBeNull();
  });

  it("keeps a landed result on the entry when the run fails after it", async () => {
    const realMarkClaimed = useFileStore.getState().markClaimed;
    try {
      renderPanel();
      const xhr = await apply();
      vi.spyOn(useFileStore.getState(), "markClaimed").mockImplementationOnce(() => {
        throw new Error("boom");
      });

      expect(() => xhr.respond(200, { downloadUrl: DOWNLOAD_URL, savedFileId: "file-1" })).toThrow(
        "boom",
      );
      await act(async () => {});

      expect(entry().status).toBe("completed");
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);
      expect(entry().error).toBeNull();
    } finally {
      useFileStore.setState({ markClaimed: realMarkClaimed });
    }
  });

  it("follows the run's file when the strip is reordered mid-run", async () => {
    useFileStore.getState().setFiles([pdf("contract.pdf"), pdf("lease.pdf")]);
    renderPanel();

    const xhr = await apply();
    act(() => useFileStore.getState().reorderFiles(0, 1));
    xhr.respond(422, { error: "Processing failed" });

    expect(entry(1).file.name).toBe("contract.pdf");
    expect(entry(1).status).toBe("failed");
    expect(entry(0).file.name).toBe("lease.pdf");
    expect(entry(0).status).toBe("pending");
  });

  it("lands a completed result and auto-save claim on the run's file when reordered mid-run (#1114)", async () => {
    useFileStore.getState().setFiles([pdf("contract.pdf"), pdf("lease.pdf")]);
    renderPanel();

    const xhr = await apply();
    act(() => useFileStore.getState().reorderFiles(0, 1));
    xhr.respond(200, { downloadUrl: DOWNLOAD_URL, savedFileId: "file-1" });

    expect(entry(1).file.name).toBe("contract.pdf");
    expect(entry(1).status).toBe("completed");
    expect(entry(1).processedUrl).toBe(DOWNLOAD_URL);
    expect(entry(1).claimed).toBe(true);
    expect(entry(0).file.name).toBe("lease.pdf");
    expect(entry(0).status).toBe("pending");
    expect(entry(0).processedUrl).toBeNull();
    expect(entry(0).claimed).toBe(false);
  });

  it("still marks the entry failed when ending the run throws", async () => {
    const realSetProcessing = useFileStore.getState().setProcessing;
    try {
      renderPanel();
      const xhr = await apply();
      vi.spyOn(useFileStore.getState(), "setProcessing").mockImplementationOnce(() => {
        throw new Error("boom");
      });

      expect(() => xhr.respond(422, { error: "Processing failed" })).toThrow("boom");

      expect(entry().status).toBe("failed");
      expect(entry().error).toBe("Processing failed");
    } finally {
      useFileStore.setState({ setProcessing: realSetProcessing });
    }
  });

  it("keeps a failed frame's server error on the panel when ending the run throws", async () => {
    renderPanel();
    await apply();
    const unsubscribe = useFileStore.subscribe((state, previous) => {
      if (previous.processing && !state.processing) {
        throw new Error("boom");
      }
    });

    try {
      expect(() =>
        act(() => {
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({
              type: "single",
              phase: "failed",
              error: "PDF is password-protected",
            }),
          });
        }),
      ).toThrow("boom");
      await act(async () => {});

      expect(screen.getByText("PDF is password-protected")).toBeInTheDocument();
      expect(screen.queryByText(en.errors.jobTrackingFailed)).not.toBeInTheDocument();
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe("PDF is password-protected");
    } finally {
      unsubscribe();
    }
  });

  it("reports the entry failure once when every store write throws on a failed frame", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    await apply();
    const unsubscribe = useFileStore.subscribe((state, previous) => {
      throw new Error(
        previous.processing && !state.processing ? "teardown broke" : "entry write broke",
      );
    });

    try {
      expect(() =>
        act(() => {
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({
              type: "single",
              phase: "failed",
              error: "PDF is password-protected",
            }),
          });
        }),
      ).toThrow("teardown broke");
      await act(async () => {});

      expect(screen.getByText("PDF is password-protected")).toBeInTheDocument();
      const reports = vi
        .mocked(captureHandledError)
        .mock.calls.filter(([e]) => e.message === "Failing a Sign PDF run's entry failed");
      expect(reports).toHaveLength(1);
      expect(reports[0][0].cause).toMatchObject({ message: "entry write broke" });
      expect(reports[0][1]).toEqual({ error_class: "bug", tool_id: "sign-pdf" });
    } finally {
      unsubscribe();
      consoleError.mockRestore();
    }
  });

  it("leaves alone a file that took the run's slot after the files were cleared", async () => {
    renderPanel();

    const xhr = await apply();
    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([pdf("lease.pdf")]);
    });
    xhr.respond(422, { error: "Processing failed" });

    expect(entry().file.name).toBe("lease.pdf");
    expect(entry().status).toBe("pending");
    expect(entry().error).toBeNull();
  });

  it("leaves the navigation guard quiet about a failed sign", async () => {
    renderPanel();

    (await apply()).respond(422, { error: "Processing failed" });

    expect(guardWork()).toBeNull();
  });

  it("still ends the run and reports it when the failure write throws", async () => {
    const realUpdateEntry = useFileStore.getState().updateEntry;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderPanel();
      const xhr = await apply();
      vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementationOnce(() => {
        throw new Error("boom");
      });

      xhr.respond(422, { error: "Processing failed" });

      expect(useFileStore.getState().processing).toBe(false);
      expect(screen.getByText("Processing failed")).toBeInTheDocument();
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Failing a Sign PDF run's entry failed" }),
        expect.objectContaining({ tool_id: "sign-pdf" }),
      );
    } finally {
      useFileStore.setState({ updateEntry: realUpdateEntry });
      consoleError.mockRestore();
    }
  });
});

/**
 * The panel writes the store's processing flag, so it owes the store the same
 * teardown use-tool-processor does on unmount. Without it, leaving the page
 * mid-sign leaves the flag behind: on the sync path a stale onload clears a
 * flag that by then belongs to the next page's run, and on the async path
 * nothing is left to clear it at all (#1122).
 *
 * cleanup() is the unmount: navigating away takes the panel with it.
 */
describe("sign-pdf lets go of the store when the panel unmounts mid-run", () => {
  it("clears the flag it set when the sign is still in flight", async () => {
    renderPanel();

    await apply();
    expect(useFileStore.getState().processing).toBe(true);

    cleanup();

    expect(useFileStore.getState().processing).toBe(false);
  });

  // The 202 path has no request left to abort: the SSE drives it, and the SSE
  // goes with the panel. Nothing else would ever end this run.
  it("clears the flag when the run went async", async () => {
    renderPanel();

    (await apply()).respond(202, { jobId: "job-1", async: true });
    expect(useFileStore.getState().processing).toBe(true);

    cleanup();

    expect(useFileStore.getState().processing).toBe(false);
  });

  it("aborts the request instead of leaving it to answer later", async () => {
    renderPanel();

    const xhr = await apply();
    cleanup();

    expect(xhr.aborted).toBe(true);
  });

  // The worst of the three. The user signs, leaves before the 200 lands, and
  // starts a run on the next tool. An unaborted request answers into endRun,
  // which writes setProcessing(false) over the new run's flag and leaves the
  // guard silent while real work is going on.
  it("does not clear the next run's flag when a stale answer arrives", async () => {
    renderPanel();

    const xhr = await apply();
    cleanup();
    // The next tool page starts its own run.
    act(() => useFileStore.getState().setProcessing(true));

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(useFileStore.getState().processing).toBe(true);
  });

  it("leaves a finished run's flag alone", async () => {
    renderPanel();

    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
    act(() => useFileStore.getState().setProcessing(true));

    cleanup();

    expect(useFileStore.getState().processing).toBe(true);
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

/**
 * #1354: the sync answer used to parse the body and land the result under one
 * catch, so a throw from our own store writes on a good 200 read as "Invalid
 * response" and vanished, with the download link already up beside it. Only
 * an unparseable body blames the server now; a landing error ends the run with
 * the client-side message and is rethrown for the console and Sentry.
 */
describe("sign-pdf tells its own failures apart from a bad response", () => {
  const realUpdateEntry = useFileStore.getState().updateEntry;
  afterEach(() => {
    useFileStore.setState({ updateEntry: realUpdateEntry });
  });

  function breakNextEntryWrite() {
    vi.spyOn(useFileStore.getState(), "updateEntry")
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementation(realUpdateEntry);
  }

  function takeOverUnhandledRejections() {
    const saved = process.listeners("unhandledRejection");
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
      rejections.push(reason);
    };
    process.removeAllListeners("unhandledRejection");
    process.on("unhandledRejection", onRejection);
    return {
      rejections,
      restore() {
        process.off("unhandledRejection", onRejection);
        for (const listener of saved) process.on("unhandledRejection", listener);
      },
    };
  }

  it("ends the run when resetting the entry at kickoff throws (#2510)", async () => {
    const unhandled = takeOverUnhandledRejections();
    const exportPlacements = vi.fn(async () => ({
      pngs: [new Blob(["png"], { type: "image/png" })],
      placements: [PLACEMENT],
    }));
    try {
      renderPanel(fakeCanvas({ exportPlacements }));
      breakNextEntryWrite();

      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await waitFor(() =>
        expect(unhandled.rejections).toEqual([expect.objectContaining({ message: "boom" })]),
      );

      expect(exportPlacements).not.toHaveBeenCalled();
      expect(FakeXhr.instances).toHaveLength(0);
      expect(FakeEventSource.instances).toHaveLength(0);
      expect(useFileStore.getState().processing).toBe(false);
      expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(en.errors.jobTrackingFailed);
      expect(entry().errorCategory).toBe("processing_error");
      expect(guardWork()).toBeNull();
    } finally {
      unhandled.restore();
    }
  });

  it.each([
    [
      "setting processing to true",
      () => {},
      (
        state: ReturnType<typeof useFileStore.getState>,
        prev: ReturnType<typeof useFileStore.getState>,
      ) => !prev.processing && state.processing,
    ],
    [
      "clearing a prior store error",
      () => {
        useFileStore.getState().setError(en.errors.runInterrupted);
      },
      (
        state: ReturnType<typeof useFileStore.getState>,
        prev: ReturnType<typeof useFileStore.getState>,
      ) => prev.error !== null && state.error === null,
    ],
  ])("ends the run when %s at kickoff throws (#2510)", async (_label, setup, shouldThrow) => {
    const unhandled = takeOverUnhandledRejections();
    let armed = true;
    setup();
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      if (armed && shouldThrow(state, prev)) {
        armed = false;
        throw new Error("kickoff broke");
      }
    });
    try {
      renderPanel();

      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await waitFor(() =>
        expect(unhandled.rejections).toEqual([
          expect.objectContaining({ message: "kickoff broke" }),
        ]),
      );

      expect(FakeXhr.instances).toHaveLength(0);
      expect(useFileStore.getState().processing).toBe(false);
      expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(en.errors.jobTrackingFailed);
      expect(entry().errorCategory).toBe("processing_error");
    } finally {
      unsubscribe();
      unhandled.restore();
    }
  });

  it("rethrows the kickoff root cause and reports the teardown failure when ending a failed start throws too (#2510)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = takeOverUnhandledRejections();
    let writes = 0;
    const unsubscribe = useFileStore.subscribe(() => {
      writes++;
      throw new Error(writes === 1 ? "kickoff root cause" : "kickoff teardown broke");
    });
    try {
      renderPanel();

      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await waitFor(() =>
        expect(unhandled.rejections).toEqual([
          expect.objectContaining({ message: "kickoff root cause" }),
        ]),
      );

      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a start error failed",
        expect.objectContaining({ message: "kickoff teardown broke" }),
      );
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
      expect(useFileStore.getState().processing).toBe(false);
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(en.errors.jobTrackingFailed);
      expect(entry().errorCategory).toBe("processing_error");
      const reports = vi
        .mocked(captureHandledError)
        .mock.calls.filter(([e]) => e.message === "Ending a tool run after its start failed");
      expect(reports).toHaveLength(1);
      expect(reports[0][0].cause).toMatchObject({ message: "kickoff teardown broke" });
      expect(reports[0][1]).toEqual({ error_class: "bug", tool_id: "sign-pdf" });
      const entryReports = vi
        .mocked(captureHandledError)
        .mock.calls.filter(([e]) => e.message === "Failing a Sign PDF run's entry failed");
      expect(entryReports).toHaveLength(1);
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      unhandled.restore();
      consoleError.mockRestore();
    }
  });

  it("updates the entry error when a retry after a failed run throws at kickoff (#2510)", async () => {
    const unhandled = takeOverUnhandledRejections();
    let unsubscribe = () => {};
    try {
      renderPanel();
      (await apply()).respond(422, { error: "Processing failed" });
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe("Processing failed");
      expect(entry().errorCategory).toBeNull();

      let armed = true;
      unsubscribe = useFileStore.subscribe((state, prev) => {
        if (armed && !prev.processing && state.processing) {
          armed = false;
          throw new Error("retry kickoff broke");
        }
      });

      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await waitFor(() =>
        expect(unhandled.rejections).toEqual([
          expect.objectContaining({ message: "retry kickoff broke" }),
        ]),
      );

      expect(FakeXhr.instances).toHaveLength(1);
      expect(useFileStore.getState().processing).toBe(false);
      expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(en.errors.jobTrackingFailed);
      expect(entry().errorCategory).toBe("processing_error");
    } finally {
      unsubscribe();
      unhandled.restore();
    }
  });

  it("clears the previous run's result and keeps Apply visible when a re-run after editing placements throws at kickoff (#2510)", async () => {
    const unhandled = takeOverUnhandledRejections();
    try {
      renderPanel(fakeCanvas(), true);
      (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
      expect(entry().status).toBe("completed");
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);

      fireEvent.click(screen.getByRole("button", { name: /✕ delete/i }));
      expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();

      breakNextEntryWrite();
      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await waitFor(() =>
        expect(unhandled.rejections).toEqual([expect.objectContaining({ message: "boom" })]),
      );

      expect(FakeXhr.instances).toHaveLength(1);
      expect(useFileStore.getState().processing).toBe(false);
      expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      expect(entry().status).toBe("failed");
      expect(entry().processedUrl).toBeNull();
      expect(entry().error).toBe(en.errors.jobTrackingFailed);
      expect(entry().errorCategory).toBe("processing_error");
    } finally {
      unhandled.restore();
    }
  });

  it("settles the run when a store listener unmounts the panel during setProcessing(true) at kickoff (#2510)", async () => {
    const exportPlacements = vi.fn(async () => ({
      pngs: [new Blob(["png"], { type: "image/png" })],
      placements: [PLACEMENT],
    }));
    renderPanel(fakeCanvas({ exportPlacements }));
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      if (!prev.processing && state.processing) {
        cleanup();
      }
    });

    try {
      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await act(async () => {});

      expect(exportPlacements).not.toHaveBeenCalled();
      expect(FakeXhr.instances).toHaveLength(0);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(en.errors.runInterrupted);
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(en.errors.runInterrupted);
      expect(entry().errorCategory).toBe("processing_error");
    } finally {
      unsubscribe();
    }
  });

  it("keeps runInterrupted on the entry when a store listener unmounts and throws during setProcessing(true) at kickoff (#2510)", async () => {
    const unhandled = takeOverUnhandledRejections();
    renderPanel();
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      if (!prev.processing && state.processing) {
        cleanup();
        throw new Error("unmount listener broke");
      }
    });

    try {
      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await waitFor(() =>
        expect(unhandled.rejections).toEqual([
          expect.objectContaining({ message: "unmount listener broke" }),
        ]),
      );

      expect(FakeXhr.instances).toHaveLength(0);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(en.errors.runInterrupted);
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(en.errors.runInterrupted);
      expect(entry().errorCategory).toBe("processing_error");
    } finally {
      unsubscribe();
      unhandled.restore();
    }
  });

  it("ends the run with the tracking message when landing the result throws", async () => {
    renderPanel();
    const xhr = await apply();
    breakNextEntryWrite();

    expect(() => xhr.respond(200, { downloadUrl: DOWNLOAD_URL })).toThrow("boom");
    // act() skips its flush when the callback throws; let the render land.
    await act(async () => {});

    expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
    expect(screen.queryByText(en.errors.invalidResponse)).not.toBeInTheDocument();
    // No download link beside the error: the result never landed.
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply & download/i })).toBeEnabled();
    expect(useFileStore.getState().processing).toBe(false);
    // Only the landing write broke, so the failure still reaches the entry (#1969).
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.jobTrackingFailed);
  });

  it("offers no download link when landing a streamed result throws", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    breakNextEntryWrite();

    expect(() =>
      act(() => {
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({
            type: "single",
            phase: "complete",
            result: { downloadUrl: DOWNLOAD_URL },
          }),
        });
      }),
    ).toThrow("boom");
    await act(async () => {});

    expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.jobTrackingFailed);
  });

  it("keeps the download link without jobTrackingFailed when ending a completed streamed run throws (#2509)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ canceled: true })));
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    const xhr = await apply();
    const unsubscribe = useFileStore.subscribe((state, previous) => {
      if (previous.processing && !state.processing) {
        throw new Error("boom");
      }
    });

    try {
      expect(() =>
        act(() => {
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({
              type: "single",
              phase: "complete",
              result: { downloadUrl: DOWNLOAD_URL },
            }),
          });
        }),
      ).toThrow("boom");
      await act(async () => {});

      expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
        "href",
        DOWNLOAD_URL,
      );
      expect(screen.queryByText(en.errors.jobTrackingFailed)).not.toBeInTheDocument();
      expect(useFileStore.getState().processing).toBe(false);
      expect(xhr.aborted).toBe(false);
      expect(entry().status).toBe("completed");
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);
      expect(entry().error).toBeNull();
      xhr.respond(202, { jobId: "job-1", async: true });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("rethrows the root cause when ending the run throws too", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    const xhr = await apply();
    // A store listener that breaks on every write: landing the result throws
    // the root cause, then endRun's store write throws again.
    let writes = 0;
    const unsubscribe = useFileStore.subscribe(() => {
      writes++;
      throw new Error(writes === 1 ? "root cause" : "teardown broke");
    });

    try {
      expect(() => xhr.respond(200, { downloadUrl: DOWNLOAD_URL })).toThrow("root cause");
      await act(async () => {});

      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a result handling error failed",
        expect.objectContaining({ message: "teardown broke" }),
      );
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      expect(useFileStore.getState().processing).toBe(false);
      // The teardown's own throw reaches Sentry once, as a handled error
      // (#1882). The root cause is rethrown, so it isn't reported here.
      const reports = vi
        .mocked(captureHandledError)
        .mock.calls.filter(
          ([e]) => e.message === "Ending a Sign PDF run after a result handling error failed",
        );
      expect(reports).toHaveLength(1);
      expect(reports[0][0].cause).toMatchObject({ message: "teardown broke" });
      expect(reports[0][1]).toEqual({ error_class: "bug", tool_id: "sign-pdf" });
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      consoleError.mockRestore();
    }
  });

  it("rethrows the root cause and reports the teardown failure when ending a streamed run throws too", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    let writes = 0;
    const unsubscribe = useFileStore.subscribe(() => {
      writes++;
      throw new Error(writes === 1 ? "root cause" : "teardown broke");
    });

    try {
      expect(() =>
        act(() => {
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({
              type: "single",
              phase: "complete",
              result: { downloadUrl: DOWNLOAD_URL },
            }),
          });
        }),
      ).toThrow("root cause");
      await act(async () => {});

      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a stream handling error failed",
        expect.objectContaining({ message: "teardown broke" }),
      );
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      expect(useFileStore.getState().processing).toBe(false);
      const reports = vi
        .mocked(captureHandledError)
        .mock.calls.filter(
          ([e]) => e.message === "Ending a Sign PDF run after a stream handling error failed",
        );
      expect(reports).toHaveLength(1);
      expect(reports[0][0].cause).toMatchObject({ message: "teardown broke" });
      expect(reports[0][1]).toEqual({ error_class: "bug", tool_id: "sign-pdf" });
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
      consoleError.mockRestore();
    }
  });

  // A fast sign answers twice. Once the streamed answer has failed to land,
  // the 200 behind it must not land it again or replace the error.
  it("ignores the sync answer after the streamed one failed to land", async () => {
    renderPanel();
    const xhr = await apply();
    breakNextEntryWrite();
    expect(() =>
      act(() => {
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({
            type: "single",
            phase: "complete",
            result: { downloadUrl: DOWNLOAD_URL },
          }),
        });
      }),
    ).toThrow("boom");
    await act(async () => {});

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(entry().processedUrl).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
  });

  // #1885: the stream's completed frame can beat the 200. Once a frame with
  // nothing to download has ended the run, the 200 behind it must not land a
  // link beside the error.
  it("ignores the sync answer after the streamed one came with no result", async () => {
    renderPanel();
    const xhr = await apply();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete" }),
      });
    });

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(entry().processedUrl).toBeNull();
    expect(entry().status).not.toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledOnce();
  });

  // #1940: the opposite order. Once the stream has landed a good result, a
  // malformed sync 200 behind it must neither put "Invalid response" beside
  // the download link nor report a second answer for a settled run.
  it("ignores a malformed sync 200 after the result landed on the stream", async () => {
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

    act(() => {
      xhr.status = 200;
      xhr.responseText = "<html>not json</html>";
      xhr.onload?.();
    });

    expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
      "href",
      DOWNLOAD_URL,
    );
    expect(screen.queryByText(en.errors.invalidResponse)).not.toBeInTheDocument();
    expect(entry().status).toBe("completed");
    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(entry().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a non-2xx answer",
      (xhr: FakeXhr) => {
        xhr.status = 504;
        xhr.responseText = "<html>504 Gateway Time-out</html>";
        xhr.onload?.();
      },
      en.errors.processingFailedWithStatus.replace("{status}", "504"),
    ],
    ["a network error", (xhr: FakeXhr) => xhr.onerror?.(), en.errors.network],
    ["a timeout", (xhr: FakeXhr) => xhr.ontimeout?.(), en.toolSettings["sign-pdf"].timeout],
  ])(
    "ignores %s after the result landed on the stream",
    async (_label, fireLateFailure, unexpectedMessage) => {
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

      act(() => fireLateFailure(xhr));

      expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
        "href",
        DOWNLOAD_URL,
      );
      expect(screen.queryByText(unexpectedMessage)).not.toBeInTheDocument();
      expect(entry().status).toBe("completed");
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);
      expect(entry().error).toBeNull();
    },
  );

  it("leaves a retry running when a stream-completed run's 200 arrives late", async () => {
    renderPanel(fakeCanvas(), true);
    const first = await apply();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: DOWNLOAD_URL },
        }),
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /✕ delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    expect(useFileStore.getState().processing).toBe(true);

    first.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(useFileStore.getState().processing).toBe(true);
    expect(screen.getByRole("button", { name: /signing/i })).toBeDisabled();
    expect(entry().processedUrl).toBeNull();
  });

  it("ignores a queued malformed or failed SSE frame after a sync 200 settled the run (#2932)", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

      act(() => {
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({ type: "single", phase: "processing", percent: 50 }),
        });
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
        });
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({ type: "single", phase: "failed", error: "late error" }),
        });
      });
      stalls.fireLatest();

      expect(screen.getByRole("link", { name: /download signed pdf/i })).toHaveAttribute(
        "href",
        DOWNLOAD_URL,
      );
      expect(screen.queryByText(en.errors.invalidResponse)).not.toBeInTheDocument();
      expect(screen.queryByText("late error")).not.toBeInTheDocument();
      expect(screen.queryByText(en.toolSettings["sign-pdf"].stall)).not.toBeInTheDocument();
      expect(entry().status).toBe("completed");
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);
      expect(entry().error).toBeNull();
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      stalls.restore();
    }
  });

  it.each([
    ["a malformed 200", (xhr: FakeXhr) => xhr.respond(200, {}), en.errors.invalidResponse, 1],
    [
      "a failed 422",
      (xhr: FakeXhr) => xhr.respond(422, { error: "Processing failed" }),
      "Processing failed",
      0,
    ],
  ])(
    "ignores a queued SSE complete, failed, or stall after %s settled the run (#2932)",
    async (_label, respondSync, expectedError, expectedReports) => {
      const stalls = captureStallTimers();
      try {
        renderPanel();
        const xhr = await apply();
        respondSync(xhr);
        expect(screen.getByText(expectedError)).toBeInTheDocument();
        expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(expectedReports);

        act(() => {
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({ type: "single", phase: "processing", percent: 50 }),
          });
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({
              type: "single",
              phase: "complete",
              result: { downloadUrl: DOWNLOAD_URL },
            }),
          });
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
          });
          FakeEventSource.instances[0].onmessage?.({
            data: JSON.stringify({ type: "single", phase: "failed", error: "late stream error" }),
          });
        });
        stalls.fireLatest();

        expect(screen.getByText(expectedError)).toBeInTheDocument();
        expect(screen.queryByText("late stream error")).not.toBeInTheDocument();
        expect(
          screen.queryByRole("link", { name: /download signed pdf/i }),
        ).not.toBeInTheDocument();
        expect(entry().status).toBe("failed");
        expect(entry().error).toBe(expectedError);
        expect(entry().processedUrl).toBeNull();
        expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(expectedReports);
      } finally {
        stalls.restore();
      }
    },
  );

  it.each([
    ["a JSON null body", null],
    ["a JSON string body", "ok"],
    ["a body with no download URL", { jobId: "job-1" }],
  ])("still says the response was invalid for %s", async (_label, body) => {
    renderPanel();

    (await apply()).respond(200, body);

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("still says the response was invalid for a body that does not parse", async () => {
    renderPanel();
    const xhr = await apply();

    act(() => {
      xhr.status = 200;
      xhr.responseText = "<html>not json</html>";
      xhr.onload?.();
    });

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
  });
});

/**
 * #1740: a result that isn't one is a server bug the user sees and nobody else
 * hears about. Sign PDF said so on screen but never reported it, on either
 * answer.
 */
describe("sign-pdf reports a malformed result", () => {
  function expectReported(message: string, statusCode: number | undefined) {
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error.message).toBe(message);
    expect(error.cause).toBeUndefined();
    expect((error as { statusCode?: number }).statusCode).toBe(statusCode);
    expect(tags).toEqual({ error_class: "operational", tool_id: "sign-pdf" });
  }

  it.each([
    ["an empty object", {}],
    ["a job id with no download URL", { jobId: "job-1" }],
  ])("reports a 200 with %s", async (_label, body) => {
    renderPanel();

    (await apply()).respond(200, body);

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(entry().status).not.toBe("completed");
    expectReported("Tool result has no download URL", 200);
  });

  it("reports a 200 whose body does not parse, without its text", async () => {
    renderPanel();
    const xhr = await apply();

    act(() => {
      xhr.status = 200;
      xhr.responseText = "<html>secret-token</html>";
      xhr.onload?.();
    });

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expectReported("Tool result body is not a JSON object", 200);
  });

  it("reports a streamed result with no download URL", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });

    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: { jobId: "job-1" } }),
      });
    });

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
    expect(entry().status).not.toBe("completed");
    expect(entry().processedUrl).toBeNull();
    expectReported("Tool result has no download URL", undefined);
  });

  // #1885: a completed frame with no result used to fall into the progress
  // branch and sit at processing until the five-minute stall timer, and a
  // result that isn't an object was filed under the wrong type.
  it.each([
    ["no result", {}],
    ["a string result", { result: "done" }],
    ["an array result", { result: [] }],
  ])("ends the run at once on a streamed frame with %s", async (_label, extra) => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });

    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", ...extra }),
      });
    });

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
    expect(entry().status).not.toBe("completed");
    expect(entry().processedUrl).toBeNull();
    expectReported("Tool result body is not a JSON object", undefined);
  });

  it("reports nothing for a good result", async () => {
    renderPanel();

    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("reports once when both the streamed frame and a queued 200 are malformed", async () => {
    renderPanel();
    const xhr = await apply();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
      });
    });

    act(() => {
      xhr.status = 200;
      xhr.responseText = "<html>not json</html>";
      xhr.onload?.();
    });

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expectReported("Tool result has no download URL", undefined);
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

const STALL_MS = 5 * 60_000;

/**
 * Captures the progress stream's stall timer (the one five-minute timeout the
 * panel arms) so a test can fire the stall without faking every timer, which
 * would stall Testing Library's own waitFor too. Tracks clearTimeout as well,
 * so a test can tell a stall that was pushed back from one still counting.
 */
function captureStallTimers() {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const stalls: { fire: () => void; cleared: boolean }[] = [];
  const byHandle = new Map<unknown, (typeof stalls)[number]>();
  const setSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    handler: () => void,
    ms?: number,
  ) => {
    if (ms !== STALL_MS) return realSetTimeout(handler, ms);
    const handle = realSetTimeout(() => {}, 0);
    const stall = { fire: handler, cleared: false };
    stalls.push(stall);
    byHandle.set(handle, stall);
    return handle;
  }) as typeof setTimeout);
  const clearSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(((
    handle?: Parameters<typeof clearTimeout>[0],
  ) => {
    const stall = byHandle.get(handle);
    if (stall) stall.cleared = true;
    realClearTimeout(handle);
  }) as typeof clearTimeout);
  return {
    /** Fire the most recently armed stall, as five quiet minutes would. */
    fireLatest() {
      const stall = stalls.at(-1);
      if (!stall) throw new Error("no stall timer armed");
      act(() => stall.fire());
    },
    /** Every stall armed so far, in order, with whether it was cleared. */
    all() {
      return stalls;
    },
    restore() {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    },
  };
}

const FAILED_FRAME = { type: "single", phase: "failed", error: "sidecar died" };

/**
 * #1958: once the progress stream gives up on a run (a failed frame, or five
 * quiet minutes), the request behind it has to go too. A fast sign answers
 * 200, so a request left running could land the signed PDF's link beside the
 * stall error, and a late network error, timeout, or 4xx would replace it.
 */
describe("sign-pdf drops a request the progress stream gave up on", () => {
  it("aborts the request and keeps the stall message after a stall", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      stalls.fireLatest();
      expect(useFileStore.getState().processing).toBe(false);

      // A no-op once aborted, as in a browser; the guards themselves are
      // pinned by the tests below that call the handlers directly.
      xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

      expect(xhr.aborted).toBe(true);
      expect(screen.getByText(en.toolSettings["sign-pdf"].stall)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
      expect(entry().status).not.toBe("completed");
      expect(entry().processedUrl).toBeNull();
    } finally {
      stalls.restore();
    }
  });

  it("aborts the request after a failed frame", async () => {
    renderPanel();
    const xhr = await apply();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(FAILED_FRAME) });
    });

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(xhr.aborted).toBe(true);
    expect(screen.getByText("sidecar died")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    expect(entry().processedUrl).toBeNull();
  });

  // abort() stops the load event in a real browser. These call the handlers
  // directly, as an answer already queued behind the abort would.
  it("ignores a late 200 that slips past the abort", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      stalls.fireLatest();

      act(() => {
        xhr.status = 200;
        xhr.responseText = JSON.stringify({ downloadUrl: DOWNLOAD_URL });
        xhr.onload?.();
      });

      expect(screen.getByText(en.toolSettings["sign-pdf"].stall)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
      expect(entry().status).not.toBe("completed");
      expect(entry().processedUrl).toBeNull();
    } finally {
      stalls.restore();
    }
  });

  // The user retries after the stall. A late 200 from the first run must not
  // end the second one: without the guard in onload, landResult stays quiet
  // (the run is settled) but endRun still clears the retry's processing flag.
  it("leaves a retry running when the stalled run answers late", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const first = await apply();
      stalls.fireLatest();

      fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      expect(useFileStore.getState().processing).toBe(true);

      act(() => {
        first.status = 200;
        first.responseText = JSON.stringify({ downloadUrl: DOWNLOAD_URL });
        first.onload?.();
      });

      expect(useFileStore.getState().processing).toBe(true);
      expect(entry().processedUrl).toBeNull();
      expect(screen.queryByRole("link", { name: /download signed pdf/i })).not.toBeInTheDocument();
    } finally {
      stalls.restore();
    }
  });

  it("ignores a late error answer after a stall", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      stalls.fireLatest();

      act(() => {
        xhr.status = 422;
        xhr.responseText = JSON.stringify({ error: "Processing failed" });
        xhr.onload?.();
      });

      expect(screen.getByText(en.toolSettings["sign-pdf"].stall)).toBeInTheDocument();
      expect(screen.queryByText("Processing failed")).not.toBeInTheDocument();
    } finally {
      stalls.restore();
    }
  });

  it("ignores a late network error after a stall", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      stalls.fireLatest();

      act(() => xhr.onerror?.());

      expect(screen.getByText(en.toolSettings["sign-pdf"].stall)).toBeInTheDocument();
      expect(screen.queryByText(en.errors.network)).not.toBeInTheDocument();
    } finally {
      stalls.restore();
    }
  });

  it("ignores a late timeout after a failed frame", async () => {
    renderPanel();
    const xhr = await apply();
    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(FAILED_FRAME) });
    });

    act(() => xhr.ontimeout?.());

    expect(screen.getByText("sidecar died")).toBeInTheDocument();
    expect(screen.queryByText(en.toolSettings["sign-pdf"].timeout)).not.toBeInTheDocument();
  });

  it("does not abort a request whose run completed on the stream", async () => {
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
    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(xhr.aborted).toBe(false);
    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
  });

  it("does not abort a request that answered first", async () => {
    renderPanel();
    const xhr = await apply();

    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(xhr.aborted).toBe(false);
    expect(entry().status).toBe("completed");
  });
});

/**
 * #1968: the stall timer is armed before the upload starts, and only the
 * progress stream used to reset it. A large PDF still uploading while the
 * stream was quiet (a buffering proxy) got called stalled, and since #1958 the
 * stall also aborts the request, cutting off an upload that was still moving.
 */
describe("sign-pdf counts upload progress as a sign of life", () => {
  it("pushes the stall back while upload bytes are moving", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      expect(xhr.uploadHandlerAtSend).toBe(true);
      const armedBeforeUpload = stalls.all().at(-1);
      expect(armedBeforeUpload?.cleared).toBe(false);

      xhr.uploadProgress(1, 4);

      // The five minutes that started before the upload never run out.
      expect(armedBeforeUpload?.cleared).toBe(true);
      expect(stalls.all().at(-1)?.cleared).toBe(false);
      expect(xhr.aborted).toBe(false);
      expect(useFileStore.getState().processing).toBe(true);
      expect(screen.queryByText(en.toolSettings["sign-pdf"].stall)).not.toBeInTheDocument();

      xhr.respond(200, { downloadUrl: DOWNLOAD_URL });
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    } finally {
      stalls.restore();
    }
  });

  it("still stalls after five quiet minutes once the upload stops moving", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      xhr.uploadProgress(4, 4);

      stalls.fireLatest();

      expect(xhr.aborted).toBe(true);
      expect(screen.getByText(en.toolSettings["sign-pdf"].stall)).toBeInTheDocument();
      expect(useFileStore.getState().processing).toBe(false);
    } finally {
      stalls.restore();
    }
  });

  it("does not arm a new stall for upload progress after the run ended", async () => {
    const stalls = captureStallTimers();
    try {
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
      const armed = stalls.all().length;

      xhr.uploadProgress(4, 4);

      expect(stalls.all()).toHaveLength(armed);
      expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    } finally {
      stalls.restore();
    }
  });
});

/**
 * #2313: unmounting cleared the file store's flag (#1122) but left everything else
 * about a cut-off sign unsaid. Crossing the layout breakpoint remounts the panel,
 * whose state is local, so the new one showed an idle submit button while the
 * server went on signing a PDF nobody would collect, and the entry stayed pending.
 */
describe("sign-pdf says so, and stops the job, when the panel unmounts mid-run (#2313)", () => {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ canceled: true })),
  );
  const cancelPosts = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/cancel"));

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fails the entry and leaves a message when the sign is cut off mid-upload", async () => {
    renderPanel();
    await apply();
    expect(entry().status).toBe("pending");

    cleanup();

    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.runInterrupted);
    expect(entry().errorCategory).toBe("processing_error");
    expect(useFileStore.getState().error).toBe(en.errors.runInterrupted);
    expect(useFileStore.getState().processing).toBe(false);
    // The server never accepted a job, so there is nothing to cancel.
    expect(cancelPosts()).toHaveLength(0);
    // A remounted panel (crossing the layout breakpoint) shows the message, and
    // retrying clears it.
    renderPanel();
    expect(screen.getByText(en.errors.runInterrupted)).toBeInTheDocument();
    FakeXhr.instances = [];
    await apply();
    expect(screen.queryByText(en.errors.runInterrupted)).not.toBeInTheDocument();
  });

  // The browser has sent the whole body and the server hasn't answered: it may be
  // validating the PDF and signatures or waiting in waitForJob, and will enqueue.
  // Aborting would leave that job running with nothing to cancel it by, so the
  // request stays open and the cancel goes out when the 202 arrives (#2239).
  it("keeps the request after the upload finished and cancels when the 202 arrives (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.uploadFinished();

    cleanup();

    expect(xhr.aborted).toBe(false);
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.OPEN);
    expect(cancelPosts()).toHaveLength(0);
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.runInterrupted);
    expect(useFileStore.getState().processing).toBe(false);

    xhr.respond(202, { jobId: "job-1", async: true });
    const clientJobId = xhr.body?.get("clientJobId") as string;
    await waitFor(() => expect(cancelPosts()).toHaveLength(1));
    expect(cancelPosts()[0][0]).toBe(`/api/v1/jobs/${clientJobId}/cancel`);
    expect(cancelPosts()[0][1]).toMatchObject({ method: "POST" });
    expect(FakeEventSource.instances[0].readyState).toBe(2);
  });

  // sign-pdf waits in waitForJob before answering 202, so a progress frame from
  // the worker during that window is often the first proof the job exists.
  it("cancels and closes the kept request when a progress frame arrives after unmount (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.uploadFinished();
    const clientJobId = xhr.body?.get("clientJobId") as string;

    cleanup();
    expect(xhr.aborted).toBe(false);
    expect(cancelPosts()).toHaveLength(0);

    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "processing", percent: 20 }),
      });
    });

    await waitFor(() => expect(cancelPosts()).toHaveLength(1));
    expect(cancelPosts()[0][0]).toBe(`/api/v1/jobs/${clientJobId}/cancel`);
    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(xhr.aborted).toBe(true);
  });

  // Firefox fires upload.onload only once the answer starts, so the last upload
  // progress event is all the panel has to go on.
  it("treats the final upload progress event as the upload being done (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.uploadProgress(100, 100);

    cleanup();

    expect(xhr.aborted).toBe(false);
    expect(cancelPosts()).toHaveLength(0);

    // Firefox fires upload.onload once the response starts, after the stop.
    xhr.uploadFinished();
    xhr.respond(202, { jobId: "job-1", async: true });
    const clientJobId = xhr.body?.get("clientJobId") as string;
    await waitFor(() => expect(cancelPosts()).toHaveLength(1));
    expect(cancelPosts()[0][0]).toBe(`/api/v1/jobs/${clientJobId}/cancel`);
  });

  it("aborts when the upload progress shows the body is only partly sent (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.uploadProgress(40, 100);

    cleanup();

    expect(xhr.aborted).toBe(true);
    expect(cancelPosts()).toHaveLength(0);
  });

  it("aborts when an upload progress event has lengthComputable false (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    act(() => {
      xhr.upload.onprogress?.(
        new ProgressEvent("progress", { loaded: 0, total: 0, lengthComputable: false }),
      );
    });

    cleanup();

    expect(xhr.aborted).toBe(true);
    expect(cancelPosts()).toHaveLength(0);
  });

  it("sends no cancel when the answer to a stopped, uploaded file is not a 202 (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.uploadFinished();

    cleanup();
    xhr.respond(200, { downloadUrl: DOWNLOAD_URL });

    expect(cancelPosts()).toHaveLength(0);
    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(entry().processedUrl).toBeNull();
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.runInterrupted);
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("ignores a kept request's late answer or error once a new run has started (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.uploadFinished();

    cleanup();
    act(() => {
      useFileStore.getState().setError(null);
      useFileStore.getState().setProcessing(true);
    });

    xhr.respond(422, { error: "Processing failed" });
    act(() => xhr.onerror?.());
    act(() => xhr.ontimeout?.());

    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(cancelPosts()).toHaveLength(0);
  });

  it("cancels once and aborts when a progress frame arrived after the upload finished (#2239)", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.uploadFinished();
    const clientJobId = xhr.body?.get("clientJobId") as string;
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "processing", percent: 40 }),
      });
    });

    cleanup();

    expect(xhr.aborted).toBe(true);
    expect(cancelPosts()).toHaveLength(1);
    expect(cancelPosts()[0][0]).toBe(`/api/v1/jobs/${clientJobId}/cancel`);

    // Even if a late 202 slips past abort(), it does not fire a second cancel.
    act(() => {
      xhr.status = 202;
      xhr.responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhr.onload?.();
    });
    expect(cancelPosts()).toHaveLength(1);
  });

  it("settles the run and sends no request when cut off during signature export", async () => {
    let resolveExport: (value: { pngs: Blob[]; placements: SignPlacement[] }) => void = () => {};
    renderPanel(
      fakeCanvas({
        exportPlacements: () =>
          new Promise((resolve) => {
            resolveExport = resolve;
          }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));
    expect(useFileStore.getState().processing).toBe(true);

    cleanup();
    await act(async () => {
      resolveExport({
        pngs: [new Blob(["png"], { type: "image/png" })],
        placements: [PLACEMENT],
      });
    });

    expect(FakeXhr.instances).toHaveLength(0);
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.runInterrupted);
    expect(entry().errorCategory).toBe("processing_error");
    expect(useFileStore.getState().error).toBe(en.errors.runInterrupted);
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("keeps the interrupted error when signature export rejects after unmount", async () => {
    let rejectExport: (reason: unknown) => void = () => {};
    renderPanel(
      fakeCanvas({
        exportPlacements: () =>
          new Promise((_resolve, reject) => {
            rejectExport = reject;
          }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /apply & download/i }));

    cleanup();
    await act(async () => {
      rejectExport(new Error("canvas unmounted"));
    });

    expect(FakeXhr.instances).toHaveLength(0);
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.runInterrupted);
    expect(entry().errorCategory).toBe("processing_error");
    expect(useFileStore.getState().error).toBe(en.errors.runInterrupted);
  });

  it("closes the stream and cancels the job once the server has accepted it", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    const clientJobId = xhr.body?.get("clientJobId") as string;

    cleanup();

    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(cancelPosts()).toHaveLength(1);
    expect(cancelPosts()[0][0]).toBe(`/api/v1/jobs/${clientJobId}/cancel`);
    expect(cancelPosts()[0][1]).toMatchObject({ method: "POST" });
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.runInterrupted);
    expect(entry().errorCategory).toBe("processing_error");
  });

  it("counts a progress frame as the server having the job", async () => {
    renderPanel();
    const xhr = await apply();
    const clientJobId = xhr.body?.get("clientJobId") as string;
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "processing", percent: 40 }),
      });
    });

    cleanup();

    expect(cancelPosts()).toHaveLength(1);
    expect(cancelPosts()[0][0]).toBe(`/api/v1/jobs/${clientJobId}/cancel`);
  });

  it("leaves a finished run's result alone when the panel unmounts afterwards", async () => {
    renderPanel();
    (await apply()).respond(200, { downloadUrl: DOWNLOAD_URL });
    expect(entry().status).toBe("completed");

    cleanup();

    expect(entry().status).toBe("completed");
    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(useFileStore.getState().error).toBeNull();
    expect(cancelPosts()).toHaveLength(0);
    // Crossing the 768px breakpoint remounts the panel (#2512): the signed PDF
    // link stays on screen instead of reverting to Apply & Download.
    renderPanel();
    const link = screen.getByRole("link", { name: /download signed pdf/i });
    expect(link).toHaveAttribute("href", DOWNLOAD_URL);
    expect(screen.queryByRole("button", { name: /apply & download/i })).not.toBeInTheDocument();
  });

  it("leaves an accepted run's streamed result and failure alone when the panel unmounts afterwards", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify(FAILED_FRAME),
      });
    });
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe("sidecar died");

    cleanup();

    expect(entry().error).toBe("sidecar died");
    expect(useFileStore.getState().error).toBeNull();
    expect(cancelPosts()).toHaveLength(0);
    // Crossing the 768px breakpoint remounts the panel (#2512): the run's
    // failure message stays visible and clears when a retry starts.
    renderPanel();
    expect(screen.getByText("sidecar died")).toBeInTheDocument();
    FakeXhr.instances = [];
    await apply();
    expect(screen.queryByText("sidecar died")).not.toBeInTheDocument();
  });

  it("leaves a panel that never ran alone", () => {
    renderPanel();

    cleanup();

    expect(entry().status).toBe("pending");
    expect(useFileStore.getState().error).toBeNull();
    expect(cancelPosts()).toHaveLength(0);
  });

  it("writes nothing into a store the user already cleared, while still stopping the run", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    act(() => useFileStore.getState().reset());

    cleanup();

    expect(xhr.aborted).toBe(true);
    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(cancelPosts()).toHaveLength(1);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries).toHaveLength(0);
  });

  it("reports a cancel for an abandoned Sign PDF job that finds no job", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fetchMock.mockResolvedValueOnce(new Response("{}", { status: 404 }));
      renderPanel();
      const xhr = await apply();
      xhr.respond(202, { jobId: "job-1", async: true });

      cleanup();
      await waitFor(() => expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1));

      expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
        "Cancel for an abandoned Sign PDF job found no job",
      );
      expect(vi.mocked(captureHandledError).mock.calls[0][1]).toEqual({
        error_class: "operational",
        tool_id: "sign-pdf",
        status_code: "404",
      });
    } finally {
      consoleWarn.mockRestore();
    }
  });
});

/**
 * #2721: when the client gives up on a Sign PDF run (handling a frame broke, or
 * the five-minute stall fired), the job still runs on the server and can still
 * auto-save. Both paths cancel the server job once it has been accepted.
 */
describe("sign-pdf cancels a job the client gave up on (#2721)", () => {
  const cancelUrl = (xhr: FakeXhr) =>
    `/api/v1/jobs/${xhr.body?.get("clientJobId") as string}/cancel`;
  let fetchMock: ReturnType<typeof vi.fn>;
  const realUpdateEntryById = useFileStore.getState().updateEntryById;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ canceled: true })));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    useFileStore.setState({ updateEntryById: realUpdateEntryById });
  });

  function breakNextEntryWrite() {
    vi.spyOn(useFileStore.getState(), "updateEntryById")
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementation(realUpdateEntryById);
  }

  async function breakLandingStreamResult(xhr: FakeXhr) {
    xhr.respond(202, { jobId: "job-1", async: true });
    breakNextEntryWrite();
    expect(() =>
      act(() => {
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({
            type: "single",
            phase: "complete",
            result: { downloadUrl: DOWNLOAD_URL },
          }),
        });
      }),
    ).toThrow("boom");
    await act(async () => {});
  }

  it("posts a cancel when handling the stream breaks", async () => {
    renderPanel();
    const xhr = await apply();

    await breakLandingStreamResult(xhr);

    expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
    expect(entry().status).toBe("failed");
    expect(entry().error).toBe(en.errors.jobTrackingFailed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(cancelUrl(xhr));
    expect(init.method).toBe("POST");
  });

  it("does not cancel a job the server itself reported as failed", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });

    act(() => {
      FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(FAILED_FRAME) });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cancel a failed frame's job when showing its error throws", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    const unsubscribe = useFileStore.subscribe((state, previous) => {
      if (previous.processing && !state.processing) {
        throw new Error("boom");
      }
    });

    try {
      expect(() =>
        act(() => {
          FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(FAILED_FRAME) });
        }),
      ).toThrow("boom");
      await act(async () => {});

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("sends at most one cancel when handling a frame breaks before 202 and the panel then unmounts", async () => {
    renderPanel();
    const xhr = await apply();
    breakNextEntryWrite();

    expect(() =>
      act(() => {
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({
            type: "single",
            phase: "complete",
            result: { downloadUrl: DOWNLOAD_URL },
          }),
        });
      }),
    ).toThrow("boom");
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(cancelUrl(xhr));

    // Neither a late 202 nor unmounting sends a second cancel.
    act(() => {
      xhr.status = 202;
      xhr.responseText = JSON.stringify({ jobId: "job-1", async: true });
      xhr.onload?.();
    });
    cleanup();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cancel when a streamed complete frame has no download URL", async () => {
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });

    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
      });
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts a cancel when the progress stream stalls after 202", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      xhr.respond(202, { jobId: "job-1", async: true });

      stalls.fireLatest();

      expect(screen.getByText(en.toolSettings["sign-pdf"].stall)).toBeInTheDocument();
      expect(en.toolSettings["sign-pdf"].stall).toBe("Processing timed out. Try again.");
      expect(entry().status).toBe("failed");
      expect(entry().error).toBe(en.toolSettings["sign-pdf"].stall);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(cancelUrl(xhr));
      expect(init.method).toBe("POST");
    } finally {
      stalls.restore();
    }
  });

  it("does not send a cancel when the stall fires while the file is still uploading, unless a 202 slips past the abort", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      stalls.fireLatest();

      expect(xhr.aborted).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText(en.toolSettings["sign-pdf"].stall)).toBeInTheDocument();

      // A 202 response already queued behind the abort still triggers a cancel.
      act(() => {
        xhr.status = 202;
        xhr.responseText = JSON.stringify({ jobId: "job-1", async: true });
        xhr.onload?.();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(cancelUrl(xhr));
    } finally {
      stalls.restore();
    }
  });

  it("does not send a cancel when a non-202 response slips past a pre-202 stall", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      stalls.fireLatest();

      act(() => {
        xhr.status = 200;
        xhr.responseText = JSON.stringify({ downloadUrl: DOWNLOAD_URL });
        xhr.onload?.();
      });
      act(() => {
        xhr.status = 422;
        xhr.responseText = JSON.stringify({ error: "Processing failed" });
        xhr.onload?.();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      stalls.restore();
    }
  });

  it("cancels once when a stall follows a progress frame and the 202 arrives later", async () => {
    const stalls = captureStallTimers();
    try {
      renderPanel();
      const xhr = await apply();
      act(() => {
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({ type: "single", phase: "processing", percent: 30 }),
        });
      });

      stalls.fireLatest();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(cancelUrl(xhr));

      act(() => {
        xhr.status = 202;
        xhr.responseText = JSON.stringify({ jobId: "job-1", async: true });
        xhr.onload?.();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      stalls.restore();
    }
  });

  it("posts a cancel on stall after 202 even when showing the stall message throws", async () => {
    const stalls = captureStallTimers();
    renderPanel();
    const xhr = await apply();
    xhr.respond(202, { jobId: "job-1", async: true });
    let threw = false;
    const unsubscribe = useFileStore.subscribe((state, previous) => {
      if (threw || !previous.processing || state.processing) return;
      threw = true;
      throw new Error("store broke");
    });

    try {
      expect(() => stalls.fireLatest()).toThrow("store broke");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(cancelUrl(xhr));
      expect(useFileStore.getState().processing).toBe(false);
    } finally {
      unsubscribe();
      stalls.restore();
    }
  });
});
