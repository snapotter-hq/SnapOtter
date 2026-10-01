// @vitest-environment jsdom

import { en } from "@snapotter/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  captureHandledError: vi.fn(async () => null),
}));

vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Map<string, string>(),
  parseApiError: (body: { code?: string }) =>
    body?.code === "feature_not_installed"
      ? {
          type: "feature_not_installed",
          feature: "background-removal",
          featureName: "Background Removal",
        }
      : "error",
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "33333333-3333-4333-8333-333333333333" };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { captureHandledError } from "@/lib/analytics";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: { onprogress?: unknown; onload?: (() => void) | null };
  onload?: () => void;
  onerror?: (() => void) | null;
  ontimeout?: (() => void) | null;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

class MockEventSource {
  static OPEN = 1;
  static instances: MockEventSource[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockEventSource.OPEN;
  close = vi.fn(() => {
    this.readyState = 2;
  });

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

let xhrs: MockXhr[];

const JOB_ID = "33333333-3333-4333-8333-333333333333";

function latestSse(): MockEventSource {
  return MockEventSource.instances[MockEventSource.instances.length - 1];
}

function sendSingleFrame(frame: Record<string, unknown>) {
  latestSse().onmessage?.({
    data: JSON.stringify({ type: "single", jobId: JOB_ID, ...frame }),
  } as MessageEvent);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(captureHandledError).mockClear();
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
  useFileStore.getState().reset();
  xhrs = [];
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "XMLHttpRequest",
    vi.fn(() => {
      const xhr: MockXhr = {
        status: 0,
        responseText: "",
        timeout: 0,
        upload: {},
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        abort: vi.fn(),
      };
      xhrs.push(xhr);
      return xhr;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * #799: a failed single-file run must settle the entry to "failed", not
 * leave it at the kickoff's "processing". The tool page derives the pulse
 * from status === "processing" and gates the failure screen on
 * status === "failed", so an unsettled entry pulses on the untouched
 * original forever with only the settings-panel error banner showing.
 * Single-file twin of the batch fix in #798 (#746).
 */
describe("useToolProcessor single-file failure settle (#799)", () => {
  function startRun() {
    const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([file], { startS: 0, endS: 2 });
    });
    return hook;
  }

  it("settles the entry to failed on a non-2xx response", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 500;
      xhrs[0].responseText = JSON.stringify({ error: "boom" });
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "error",
      processedUrl: null,
    });
    expect(useFileStore.getState().error).toBe("error");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  // #1341: a 413 reads the same to the user whether our API or a reverse
  // proxy sent it, and in their language, not "error" or "Processing failed".
  it.each([
    ["our API's JSON body", JSON.stringify({ error: "File exceeds the 10 MB upload limit" })],
    ["a proxy's HTML page", "<html>413 Request Entity Too Large</html>"],
  ])("shows the translated too-large message for a 413 with %s", (_label, body) => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 413;
      xhrs[0].responseText = body;
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: en.errors.fileTooLarge,
      // The message is translated, so feedback reads the cause from here (#1596).
      errorCategory: "upload_error",
    });
    expect(useFileStore.getState().error).toBe(en.errors.fileTooLarge);

    unmount();
  });

  it("settles the entry to failed on a non-2xx response with an unreadable body", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 500;
      xhrs[0].responseText = "<html>bad gateway</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing failed: 500",
      errorCategory: null,
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed on a pre-upload 502 with a non-JSON body", () => {
    const { unmount } = startRun();

    act(() => {
      // An intermediary 502 with an HTML body normally degrades to async,
      // but the upload never finished here so no job can exist server-side:
      // degradeToAsync declines and this is a real failure.
      xhrs[0].status = 502;
      xhrs[0].responseText = "<html>Bad Gateway</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing failed: 502",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed when the socket dies mid-upload", () => {
    const { unmount } = startRun();

    act(() => {
      // No upload.onload: the body never fully left the browser, so this is
      // a real failure, not the #722 degrade-to-async recovery.
      xhrs[0].onerror?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing was interrupted. Retry when reconnected.",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed on a client timeout mid-upload", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].ontimeout?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Request timed out - the server may be overloaded. Try again.",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("keeps the entry processing when a post-upload socket drop degrades to async", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    // The #722 recovery: the job is live server-side; SSE will settle it.
    expect(useFileStore.getState().entries[0].status).toBe("processing");
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("keeps the entry processing when a post-upload timeout degrades to async", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].ontimeout?.();
    });

    expect(useFileStore.getState().entries[0].status).toBe("processing");
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
  });

  it("settles the entry to failed on a post-upload 5xx the app itself emitted", () => {
    const { unmount } = startRun();

    act(() => {
      // A JSON body means the app answered (html-to-image's own 504), not an
      // intermediary standing in for a dead sync wait: a real failure, no
      // degrade even though the upload finished.
      xhrs[0].upload.onload?.();
      xhrs[0].status = 504;
      xhrs[0].responseText = JSON.stringify({ error: "render timeout" });
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "error",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("carries the feature-not-installed message onto the failed entry", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 409;
      xhrs[0].responseText = JSON.stringify({ code: "feature_not_installed" });
      xhrs[0].onload?.();
    });

    const entry = useFileStore.getState().entries[0];
    expect(entry.status).toBe("failed");
    expect(entry.error).toBe(
      format(en.errors.featureNotInstalledForTool, {
        tool: en.tools["trim-video"].name,
        feature: en.featureBundles["background-removal"].name,
      }),
    );
    expect(useFileStore.getState().error).toBe(entry.error);

    unmount();
  });

  it("does not clobber an SSE-completed entry on a late non-2xx response", () => {
    const { unmount } = startRun();

    act(() => {
      sendSingleFrame({
        phase: "complete",
        percent: 100,
        result: {
          jobId: "server-job",
          downloadUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
          originalSize: 64,
          processedSize: 32,
        },
      });
    });
    expect(useFileStore.getState().entries[0].status).toBe("completed");

    act(() => {
      // An onload task queued before the SSE settle dispatches after it;
      // the status guard must leave the completed result alone.
      xhrs[0].status = 502;
      xhrs[0].responseText = "<html>Bad Gateway</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
    });

    unmount();
  });

  it("settles the entry to failed when the SSE reports the job failed", () => {
    const { unmount } = startRun();

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "boom" });
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "boom",
    });
    expect(useFileStore.getState().error).toBe("boom");
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed on a 2xx with an unparseable body", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 200;
      xhrs[0].responseText = "<html>not json</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed when a batch terminal frame reaches a single run", () => {
    const { unmount } = startRun();
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    act(() => {
      latestSse().onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "failed",
          totalFiles: 1,
          completedFiles: 1,
          failedFiles: 1,
        }),
      } as MessageEvent);
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing was interrupted. Retry when reconnected.",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed when the job-evidence timeout fires", () => {
    const { unmount } = startRun();

    // Degrade first (#722): upload finished, socket died, no frame ever
    // proves the job exists, so the evidence timeout is the terminal path.
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().entries[0].status).toBe("processing");

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error:
        "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("settles the entry to failed when cancel finds no job server-side", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = startRun();

    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });

    const cancel = useFileStore.getState().cancelCurrentJob;
    expect(cancel).not.toBeNull();
    await act(async () => {
      await cancel?.();
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Canceled",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("the failure sweep leaves completed and pending siblings alone", () => {
    const files = ["a.mp4", "b.mp4", "c.mp4"].map(
      (name) => new File([new ArrayBuffer(64)], name, { type: "video/mp4" }),
    );
    useFileStore.getState().setFiles(files);
    // File A already carries a delivered result from an earlier run.
    useFileStore.getState().updateEntry(0, { status: "completed", processedUrl: "blob:done" });
    useFileStore.getState().setSelectedIndex(1);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles(files, { startS: 0, endS: 2 });
    });

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "boom" });
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "blob:done",
    });
    expect(useFileStore.getState().entries[1]).toMatchObject({
      status: "failed",
      error: "boom",
    });
    expect(useFileStore.getState().entries[2].status).toBe("pending");

    hook.unmount();
  });

  it("shows the operator hint a failed frame carries (#1432)", () => {
    const { unmount } = startRun();

    act(() => {
      sendSingleFrame({
        phase: "failed",
        percent: 0,
        error: "PDF processing is unavailable on this server because qpdf could not be started.",
        code: "ENGINE_UNAVAILABLE",
        details: "Check QPDF_PATH: it must point at an executable qpdf binary.",
      });
    });

    const expected =
      "PDF processing is unavailable on this server because qpdf could not be started.: " +
      "Check QPDF_PATH: it must point at an executable qpdf binary.";
    expect(useFileStore.getState().entries[0]).toMatchObject({ status: "failed", error: expected });
    expect(useFileStore.getState().error).toBe(expected);

    unmount();
  });

  it("falls back to a generic message when the failed frame carries no error", () => {
    const { unmount } = startRun();

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0 });
    });

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Processing failed",
    });
    expect(useFileStore.getState().error).toBe("Processing failed");

    unmount();
  });

  it("fails the entry the run started with, not the currently selected one", () => {
    const fileA = new File([new ArrayBuffer(64)], "a.mp4", { type: "video/mp4" });
    const fileB = new File([new ArrayBuffer(64)], "b.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([fileA, fileB]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([fileA, fileB], { startS: 0, endS: 2 });
    });

    act(() => {
      // The user browses to the other file while the run is in flight.
      useFileStore.getState().setSelectedIndex(1);
      xhrs[0].onerror?.();
    });

    expect(useFileStore.getState().entries[0].status).toBe("failed");
    expect(useFileStore.getState().entries[1].status).toBe("pending");

    hook.unmount();
  });
});

/**
 * #1354: the sync response path used to parse the body and write the result
 * under one catch, so a throw from our own store writes on a perfectly good
 * 200 read as "Invalid response from server" and the exception vanished. The
 * sync twin of #1287's SSE fix: only an unparseable body blames the server; a
 * handling error ends the run with the client-side message and is rethrown so
 * it reaches the console and Sentry's global handler.
 */
describe("useToolProcessor sync result handling errors (#1354)", () => {
  const HANDLER_FAILURE = "Something went wrong while tracking this job. Try again.";
  const RESULT = {
    jobId: "server-job",
    downloadUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
    originalSize: 64,
    processedSize: 32,
  };
  // Zustand copies state on every set, so a spy on getState().updateEntry
  // rides along into later states; put the real actions back explicitly.
  const realUpdateEntry = useFileStore.getState().updateEntry;
  const realMarkClaimed = useFileStore.getState().markClaimed;
  afterEach(() => {
    useFileStore.setState({ updateEntry: realUpdateEntry, markClaimed: realMarkClaimed });
  });

  function startRun() {
    const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([file], { startS: 0, endS: 2 });
    });
    return hook;
  }

  function respond(status: number, body: string) {
    xhrs[0].status = status;
    xhrs[0].responseText = body;
    xhrs[0].onload?.();
  }

  it("fails the run with a client-side message when the result write throws", () => {
    const { result, unmount } = startRun();
    vi.spyOn(useFileStore.getState(), "updateEntry")
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementation(realUpdateEntry);

    // The root cause surfaces instead of disappearing into the catch.
    expect(() =>
      act(() => respond(200, JSON.stringify({ ...RESULT, warning: "scaled down" }))),
    ).toThrow("boom");

    // Tools that render from the payload must not show a result beside the
    // error. act() skips its flush when the callback throws, so render first.
    act(() => {});
    expect(result.current.resultPayload).toBeNull();
    expect(result.current.warning).toBeNull();

    expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: HANDLER_FAILURE,
    });
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();

    unmount();
  });

  it("ends the run and rethrows the root cause when every entry write throws", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = startRun();
    vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation(() => {
      throw new Error("store broke");
    });

    try {
      expect(() => act(() => respond(200, JSON.stringify(RESULT)))).toThrow("store broke");

      expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(consoleError).toHaveBeenCalledWith(
        "Failing the run's entry failed",
        expect.objectContaining({ message: "store broke" }),
      );
    } finally {
      consoleError.mockRestore();
      unmount();
    }
  });

  it("keeps a written result when a write after it throws", () => {
    const { unmount } = startRun();
    vi.spyOn(useFileStore.getState(), "markClaimed").mockImplementation(() => {
      throw new Error("claim broke");
    });

    expect(() =>
      act(() => respond(200, JSON.stringify({ ...RESULT, savedFileId: "file-9" }))),
    ).toThrow("claim broke");

    // The result reached the entry; the run still ends, and says it went wrong.
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: RESULT.downloadUrl,
    });
    expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("rethrows the root cause when the teardown after it throws too", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = startRun();
    // A store listener that breaks on every write: the result write throws
    // the root cause, then the teardown's first write throws again.
    let writes = 0;
    const unsubscribe = useFileStore.subscribe(() => {
      writes++;
      throw new Error(writes === 1 ? "root cause" : "teardown broke");
    });

    try {
      expect(() => act(() => respond(200, JSON.stringify(RESULT)))).toThrow("root cause");
      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a result handling error failed",
        expect.objectContaining({ message: "teardown broke" }),
      );
      // Every teardown step still ran: the run is released for good.
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(useFileStore.getState().cancelCurrentJob).toBeNull();
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
    } finally {
      unsubscribe();
      consoleError.mockRestore();
      unmount();
    }
  });

  it.each([
    ["an unparseable body", "<html>not json</html>"],
    ["a JSON null body", "null"],
    ["a JSON string body", JSON.stringify("ok")],
  ])("still blames the server for %s", (_label, body) => {
    const { unmount } = startRun();

    act(() => respond(200, body));

    expect(useFileStore.getState().error).toBe("Invalid response from server");
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
    });
    expect(useFileStore.getState().processing).toBe(false);

    unmount();
  });

  it("lands a good result untouched", () => {
    const { result, unmount } = startRun();

    act(() => respond(200, JSON.stringify({ ...RESULT, warning: "scaled down" })));

    expect(result.current.resultPayload).toMatchObject({ downloadUrl: RESULT.downloadUrl });
    expect(result.current.warning).toBe("scaled down");

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: RESULT.downloadUrl,
      processedSize: 32,
    });
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();

    unmount();
  });
});

/**
 * #1740: a 2xx body that isn't a result is a server bug the user sees and
 * nobody else hears about. An object with no download URL (`{}`) used to land
 * as a completed run with nothing behind it, and no malformed body was ever
 * reported.
 */
describe("useToolProcessor malformed 2xx results (#1740)", () => {
  function startRun() {
    const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([file], { startS: 0, endS: 2 });
    });
    return hook;
  }

  function respond(body: string) {
    xhrs[0].status = 200;
    xhrs[0].responseText = body;
    xhrs[0].onload?.();
  }

  function expectReported(message: string) {
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error.message).toBe(message);
    expect(error.cause).toBeUndefined();
    expect((error as { statusCode?: number }).statusCode).toBe(200);
    expect(tags).toEqual({ error_class: "operational", tool_id: "trim-video" });
  }

  it.each([
    ["an empty object", "{}"],
    ["a job id with no download URL", JSON.stringify({ jobId: "j", processedSize: 3 })],
  ])("fails the run on %s and reports it", (_label, body) => {
    const { result, unmount } = startRun();

    act(() => respond(body));

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
      processedUrl: null,
    });
    expect(useFileStore.getState().error).toBe("Invalid response from server");
    expect(useFileStore.getState().processing).toBe(false);
    expect(result.current.resultPayload).toBeNull();
    expectReported("Tool result has no download URL");

    unmount();
  });

  it("reports a body that does not parse, without its text", () => {
    const { unmount } = startRun();

    act(() => respond("<html>secret-token</html>"));

    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "failed",
      error: "Invalid response from server",
    });
    expectReported("Tool result body is not a JSON object");

    unmount();
  });

  it("does not report an error response", () => {
    const { unmount } = startRun();

    act(() => {
      xhrs[0].status = 500;
      xhrs[0].responseText = "<html>Internal Server Error</html>";
      xhrs[0].onload?.();
    });

    expect(useFileStore.getState().entries[0]?.status).toBe("failed");
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();

    unmount();
  });
});

/**
 * #1698: every single-run failure exit used to fail the entry before its
 * teardown. The entry settle is a store write, and when the store keeps
 * throwing (the #1354 case) a second throw there escaped before
 * setProcessing(false) and clearActiveJob(), leaving the spinner up and the
 * cancel button armed with nothing left to settle the run. The settle now
 * runs last at every exit and logs instead of throwing. The tool-hook twin
 * of #1352's pipeline fix.
 */
describe("useToolProcessor settles the entry after the run's teardown (#1698)", () => {
  const SETTLE_FAILED_LOG = "Failing the run's entry failed";
  // Zustand copies state on every set, so a spy on getState().updateEntry
  // rides along into later states; put the real action back explicitly.
  const realUpdateEntry = useFileStore.getState().updateEntry;
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
    useFileStore.setState({ updateEntry: realUpdateEntry });
  });

  function startRun() {
    const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([file]);
    const hook = renderHook(() => useToolProcessor("trim-video"));
    act(() => {
      hook.result.current.processFiles([file], { startS: 0, endS: 2 });
    });
    return hook;
  }

  function breakEntryWrites() {
    vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation(() => {
      throw new Error("store broke");
    });
  }

  // The upload finished and the socket died: the #722 degrade to async,
  // with a cancel handle armed and the evidence timer running.
  function degrade() {
    act(() => {
      xhrs[0].upload.onload?.();
      xhrs[0].onerror?.();
    });
    expect(useFileStore.getState().cancelCurrentJob).not.toBeNull();
  }

  function expectRunEnded(message: string) {
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().cancelCurrentJob).toBeNull();
    expect(useFileStore.getState().error).toBe(message);
    // The failed settle is logged, not lost.
    expect(consoleError).toHaveBeenCalledWith(
      SETTLE_FAILED_LOG,
      expect.objectContaining({ message: "store broke" }),
    );
  }

  it.each([
    ["an app error response", 500, JSON.stringify({ error: "boom" }), "error"],
    [
      "an error response whose body is not JSON",
      500,
      "<html>oops</html>",
      "Processing failed: 500",
    ],
    [
      "a 2xx body that does not parse",
      200,
      "<html>not json</html>",
      "Invalid response from server",
    ],
  ])("ends the run on %s when failing the entry throws", (_label, status, body, message) => {
    const { unmount } = startRun();
    breakEntryWrites();

    act(() => {
      xhrs[0].status = status;
      xhrs[0].responseText = body;
      xhrs[0].onload?.();
    });

    expectRunEnded(message);
    unmount();
  });

  it("ends the run when the socket dies mid-upload and failing the entry throws", () => {
    const { unmount } = startRun();
    breakEntryWrites();

    act(() => {
      xhrs[0].onerror?.();
    });

    expectRunEnded("Processing was interrupted. Retry when reconnected.");
    unmount();
  });

  it("ends the run when the request times out mid-upload and failing the entry throws", () => {
    const { unmount } = startRun();
    breakEntryWrites();

    act(() => {
      xhrs[0].ontimeout?.();
    });

    expectRunEnded("Request timed out - the server may be overloaded. Try again.");
    unmount();
  });

  it("ends the run with the frame's own error when failing the entry throws", () => {
    const { unmount } = startRun();
    degrade();
    breakEntryWrites();

    act(() => {
      sendSingleFrame({ phase: "failed", percent: 0, error: "server said no" });
    });

    // The server's error, not the generic frame-handling one.
    expectRunEnded("server said no");
    unmount();
  });

  it("ends the run when a batch terminal frame reaches a single run and failing the entry throws", () => {
    const { unmount } = startRun();
    degrade();
    breakEntryWrites();

    act(() => {
      latestSse().onmessage?.({
        data: JSON.stringify({
          type: "batch",
          jobId: JOB_ID,
          status: "failed",
          totalFiles: 1,
          completedFiles: 1,
          failedFiles: 1,
        }),
      } as MessageEvent);
    });

    expectRunEnded("Processing was interrupted. Retry when reconnected.");
    unmount();
  });

  it("ends the run when the server never confirms it and failing the entry throws", () => {
    const { unmount } = startRun();
    degrade();
    breakEntryWrites();

    act(() => {
      vi.advanceTimersByTime(30_001);
    });

    expectRunEnded(
      "Processing was interrupted and the server never confirmed the job. Retry when reconnected.",
    );
    unmount();
  });

  it("ends the run when the cancel finds no job and failing the entry throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    );
    const { unmount } = startRun();
    degrade();
    breakEntryWrites();

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    expectRunEnded("Canceled");
    unmount();
  });

  it("lets a cancel teardown that throws reach the caller instead of swallowing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)),
    );
    const { unmount } = startRun();
    degrade();
    const cancel = useFileStore.getState().cancelCurrentJob;
    // A store listener that breaks on every write, so the teardown itself throws.
    const unsubscribe = useFileStore.subscribe(() => {
      throw new Error("teardown broke");
    });

    try {
      await act(async () => {
        await expect(cancel?.()).rejects.toThrow("teardown broke");
      });
    } finally {
      unsubscribe();
      unmount();
    }
  });

  it("keeps a run going when the cancel request itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const { unmount } = startRun();
    degrade();

    await act(async () => {
      await useFileStore.getState().cancelCurrentJob?.();
    });

    // A cancel that never reached the server says nothing about the job;
    // the progress stream still owns settling it.
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().activeJobId).toBe(JOB_ID);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().entries[0].status).toBe("processing");
    unmount();
  });
});
