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
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
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

  /** Report upload bytes moving, as the browser does while the PDF is sent. */
  uploadProgress(loaded: number, total: number) {
    act(() => {
      this.upload.onprogress?.(new ProgressEvent("progress", { loaded, total }));
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
    expect(entry().error).toBe(en.errors.processingFailedWithStatus.replace("{status}", "413"));
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
