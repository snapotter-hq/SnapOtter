// @vitest-environment jsdom

import { de } from "@snapotter/shared/i18n/de.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  formatHeaders: () => [],
}));
vi.mock("@/lib/utils", () => ({
  copyToClipboard: vi.fn(),
  generateId: () => "11111111-1111-4111-8111-111111111111",
}));

import { ocrOneFile } from "@/components/tools/ocr-settings";
import { captureHandledError } from "@/lib/analytics";

interface MockXhr {
  status: number;
  responseText: string;
  upload: { onprogress?: (event: unknown) => void; onload?: () => void };
  onload?: () => void;
  onerror?: () => void;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

let xhrs: MockXhr[];

beforeEach(() => {
  xhrs = [];
  MockEventSource.instances = [];
  vi.mocked(captureHandledError).mockClear();
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ canceled: true }))),
  );
  vi.stubGlobal(
    "XMLHttpRequest",
    vi.fn(() => {
      const xhr: MockXhr = {
        status: 0,
        responseText: "",
        upload: {},
        open: vi.fn(),
        send: vi.fn(),
        abort: vi.fn(),
        setRequestHeader: vi.fn(),
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

function runOcr(onStoppable?: (stop: () => void) => void) {
  return ocrOneFile(
    new File(["image"], "scan.png", { type: "image/png" }),
    { quality: "fast", language: "en", enhance: false },
    { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn(), onStoppable },
  );
}

describe("OCR async response handling", () => {
  it("keeps SSE alive for 202 and resolves text from the terminal worker result", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.responseText = JSON.stringify({ jobId: "job-1", status: "queued" });
    xhr.onload?.();

    expect(events.close).not.toHaveBeenCalled();

    events.emit({
      type: "single",
      phase: "complete",
      result: { text: "queued OCR text", actualQuality: "fast" },
    });

    await expect(promise).resolves.toMatchObject({ text: "queued OCR text" });
    expect(events.close).toHaveBeenCalledTimes(1);

    events.emit({ type: "single", phase: "failed", error: "late duplicate" });
    xhr.onerror?.();
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("does not arm a late stall timer when terminal SSE wins the race with 202", async () => {
    vi.useFakeTimers();
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    events.emit({
      type: "single",
      phase: "complete",
      result: { text: "fast worker result" },
    });
    await expect(promise).resolves.toMatchObject({ text: "fast worker result" });

    xhr.status = 202;
    xhr.onload?.();

    expect(vi.getTimerCount()).toBe(0);
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("resolves a synchronous 200 response and closes SSE exactly once", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 200;
    xhr.responseText = JSON.stringify({ text: "sync OCR text" });
    xhr.onload?.();

    await expect(promise).resolves.toMatchObject({ text: "sync OCR text" });
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("surfaces the saved library file id from the terminal worker result", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.onload?.();
    events.emit({
      type: "single",
      phase: "complete",
      result: { text: "saved text", savedFileId: "lib-42" },
    });

    await expect(promise).resolves.toEqual({ text: "saved text", savedFileId: "lib-42" });
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("rejects an HTTP error and closes SSE exactly once", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 422;
    xhr.responseText = JSON.stringify({ error: "OCR failed" });
    xhr.onload?.();

    await expect(promise).rejects.toThrow("OCR failed");
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("rejects a terminal async failure and closes SSE exactly once", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.onload?.();
    events.emit({ type: "single", phase: "failed", error: "runtime crashed" });

    await expect(promise).rejects.toThrow("runtime crashed");
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("treats SSE heartbeat frames as queued-job activity", async () => {
    vi.useFakeTimers();
    const promise = runOcr();
    let settlement = "pending";
    void promise.then(
      () => {
        settlement = "resolved";
      },
      () => {
        settlement = "rejected";
      },
    );
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.onload?.();
    await vi.advanceTimersByTimeAsync(299_000);
    events.emit({ type: "heartbeat" });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(settlement).toBe("pending");
    expect(events.close).not.toHaveBeenCalled();

    events.emit({
      type: "single",
      phase: "complete",
      result: { text: "still queued safely" },
    });
    await expect(promise).resolves.toMatchObject({ text: "still queued safely" });
  });

  // #1287: the onmessage catch used to wrap the whole handler, so a throw
  // while handling a frame was swallowed and a 202 OCR run waited out the
  // five-minute stall timer before reporting a misleading timeout.
  it("rejects with a real message and rethrows when frame handling throws", async () => {
    const promise = ocrOneFile(
      new File(["image"], "scan.png", { type: "image/png" }),
      { quality: "fast", language: "en", enhance: false },
      {
        onUploadProgress: vi.fn(),
        onProcessingProgress: () => {
          throw new Error("boom");
        },
      },
    );
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.onload?.();

    expect(() => events.emit({ type: "single", phase: "processing", percent: 40 })).toThrow("boom");
    await expect(promise).rejects.toThrow(
      "Something went wrong while tracking this job. Try again.",
    );
    expect(events.close).toHaveBeenCalledTimes(1);
  });

  it("uses the caller's localized processingFailed message for a handling error", async () => {
    const promise = ocrOneFile(
      new File(["image"], "scan.png", { type: "image/png" }),
      { quality: "fast", language: "en", enhance: false },
      {
        onUploadProgress: vi.fn(),
        onProcessingProgress: () => {
          throw new Error("boom");
        },
      },
      { processingFailed: "Verarbeitung fehlgeschlagen" },
    );
    xhrs[0].status = 202;
    xhrs[0].onload?.();

    expect(() =>
      MockEventSource.instances[0].emit({ type: "single", phase: "processing", percent: 40 }),
    ).toThrow("boom");
    await expect(promise).rejects.toThrow("Verarbeitung fehlgeschlagen");
  });

  it("falls back to the caller's locale for a blank failed frame or handling error (#1436)", async () => {
    const failedFramePromise = ocrOneFile(
      new File(["image"], "scan.png", { type: "image/png" }),
      { quality: "fast", language: "en", enhance: false },
      { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn() },
      { t: de },
    );
    xhrs[0].status = 202;
    xhrs[0].onload?.();
    MockEventSource.instances[0].emit({ type: "single", phase: "failed", error: "" });
    await expect(failedFramePromise).rejects.toThrow(de.errors.processingFailedNoDetail);

    const trackingErrorPromise = ocrOneFile(
      new File(["image"], "scan.png", { type: "image/png" }),
      { quality: "fast", language: "en", enhance: false },
      {
        onUploadProgress: vi.fn(),
        onProcessingProgress: () => {
          throw new Error("boom");
        },
      },
      { processingFailed: de.errors.processingFailed, t: de },
    );
    xhrs[1].status = 202;
    xhrs[1].onload?.();
    expect(() =>
      MockEventSource.instances[1].emit({ type: "single", phase: "processing", percent: 40 }),
    ).toThrow("boom");
    await expect(trackingErrorPromise).rejects.toThrow(de.errors.jobTrackingFailed);

    const canceledPromise = ocrOneFile(
      new File(["image"], "scan.png", { type: "image/png" }),
      { quality: "fast", language: "en", enhance: false },
      { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn() },
      { processingFailed: de.errors.processingFailed, t: de },
    );
    xhrs[2].status = 202;
    xhrs[2].onload?.();
    MockEventSource.instances[2].emit({
      type: "single",
      phase: "failed",
      percent: 0,
      error: "Canceled",
      code: "CANCELED",
    });
    await expect(canceledPromise).rejects.toThrow(de.errors.canceled);
  });

  it("ignores a malformed frame and still resolves from the next good one", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.onload?.();
    events.onmessage?.({ data: "not json" } as MessageEvent);
    expect(events.close).not.toHaveBeenCalled();

    events.emit({ type: "single", phase: "complete", result: { text: "after the noise" } });
    await expect(promise).resolves.toMatchObject({ text: "after the noise" });
  });

  it.each([
    [
      "stop() after the upload finished",
      async (xhr: MockXhr, stop: () => void, promise: Promise<unknown>) => {
        xhr.upload.onload?.();
        stop();
        await expect(promise).rejects.toThrow("OCR scan stopped");
      },
    ],
    [
      "a synchronous 200 response",
      async (xhr: MockXhr, _stop: () => void, promise: Promise<unknown>) => {
        xhr.status = 200;
        xhr.responseText = JSON.stringify({ text: "sync OCR text" });
        xhr.onload?.();
        await expect(promise).resolves.toMatchObject({ text: "sync OCR text" });
      },
    ],
    [
      "a synchronous 422 response",
      async (xhr: MockXhr, _stop: () => void, promise: Promise<unknown>) => {
        xhr.status = 422;
        xhr.responseText = JSON.stringify({ error: "OCR failed" });
        xhr.onload?.();
        await expect(promise).rejects.toThrow("OCR failed");
      },
    ],
  ] as const)("ignores queued SSE frames arriving after %s (#2949)", async (_label, settle) => {
    vi.useFakeTimers();
    const onProcessingProgress = vi.fn();
    let stop: () => void = () => {};
    const promise = ocrOneFile(
      new File(["image"], "scan.png", { type: "image/png" }),
      { quality: "fast", language: "en", enhance: false },
      {
        onUploadProgress: vi.fn(),
        onProcessingProgress,
        onStoppable: (s) => {
          stop = s;
        },
      },
    );
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    await settle(xhr, () => stop(), promise);

    events.emit({ type: "heartbeat" });
    events.emit({ type: "single", phase: "processing", percent: 50, stage: "Recognizing" });
    events.emit({ type: "single", phase: "complete", result: { text: "late text" } });
    events.emit({ type: "single", phase: "failed", error: "late error" });
    await vi.advanceTimersByTimeAsync(300_000);

    expect(onProcessingProgress).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe("OCR stopping a file (#2093)", () => {
  const CANCEL_URL = "/api/v1/jobs/11111111-1111-4111-8111-111111111111/cancel";

  function stoppableRun() {
    let stop: () => void = () => {};
    const promise = runOcr((s) => {
      stop = s;
    });
    promise.catch(() => {});
    return { promise, stop: () => stop() };
  }

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ canceled: true }))),
    );
  });

  it("cancels the job the server queued for the file it drops", async () => {
    const { promise, stop } = stoppableRun();
    const xhr = xhrs[0];
    xhr.status = 202;
    xhr.responseText = JSON.stringify({ jobId: "job-1", status: "queued" });
    xhr.onload?.();

    stop();

    await expect(promise).rejects.toThrow("OCR scan stopped");
    expect(xhr.abort).toHaveBeenCalled();
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      CANCEL_URL,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("aborts a file still uploading and sends no cancel", async () => {
    const { promise, stop } = stoppableRun();

    stop();

    await expect(promise).rejects.toThrow("OCR scan stopped");
    expect(xhrs[0].abort).toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  // The browser has sent the whole body and the server hasn't answered: it may be validating and
  // decoding, and will still enqueue. Aborting would leave that job running with
  // no way to cancel it, so the request stays open and the cancel goes out when
  // the 202 proves a job exists (#2136).
  it("keeps the request after the upload finished and cancels when the 202 arrives", async () => {
    const { promise, stop } = stoppableRun();
    const xhr = xhrs[0];
    xhr.upload.onload?.();

    stop();

    await expect(promise).rejects.toThrow("OCR scan stopped");
    expect(xhr.abort).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    xhr.status = 202;
    xhr.responseText = JSON.stringify({ jobId: "job-1", status: "queued" });
    xhr.onload?.();

    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      CANCEL_URL,
      expect.objectContaining({ method: "POST" }),
    );
    // The stopped scan stays stopped: no stream is reopened, no timer armed.
    expect(MockEventSource.instances[0].close).toHaveBeenCalled();
  });

  // Firefox fires upload.onload only once the answer starts, so the last upload
  // progress event is all the scan has to go on.
  it("treats the final upload progress event as the upload being done", async () => {
    const { promise, stop } = stoppableRun();
    const xhr = xhrs[0];
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 10, total: 10 });

    stop();
    await expect(promise).rejects.toThrow("OCR scan stopped");
    expect(xhr.abort).not.toHaveBeenCalled();

    xhr.status = 202;
    xhr.responseText = JSON.stringify({ jobId: "job-1", status: "queued" });
    xhr.onload?.();
    await vi.waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1));
  });

  it("aborts when the upload progress shows the body is only partly sent", async () => {
    const { promise, stop } = stoppableRun();
    const xhr = xhrs[0];
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 10 });

    stop();
    await expect(promise).rejects.toThrow("OCR scan stopped");

    expect(xhr.abort).toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("sends no cancel when the answer to a stopped, uploaded file is not a 202", async () => {
    const { promise, stop } = stoppableRun();
    const xhr = xhrs[0];
    xhr.upload.onload?.();

    stop();
    await expect(promise).rejects.toThrow("OCR scan stopped");

    xhr.status = 200;
    xhr.responseText = JSON.stringify({ text: "done" });
    xhr.onload?.();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("sends no cancel for a file that already finished", async () => {
    const { promise, stop } = stoppableRun();
    const xhr = xhrs[0];
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ text: "done" });
    xhr.onload?.();
    await expect(promise).resolves.toMatchObject({ text: "done" });

    stop();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("sends no cancel for a queued file whose result already arrived", async () => {
    const { promise, stop } = stoppableRun();
    const xhr = xhrs[0];
    xhr.status = 202;
    xhr.responseText = JSON.stringify({ jobId: "job-1", status: "queued" });
    xhr.onload?.();
    MockEventSource.instances[0].emit({
      type: "single",
      phase: "complete",
      result: { text: "done", actualQuality: "fast" },
    });
    await expect(promise).resolves.toMatchObject({ text: "done" });

    stop();

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe("OCR canceling a job the client gave up on (#2721)", () => {
  const CANCEL_URL = "/api/v1/jobs/11111111-1111-4111-8111-111111111111/cancel";

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ canceled: true }))),
    );
  });

  it("posts a cancel when the five-minute stall timer fires after 202", async () => {
    vi.useFakeTimers();
    const promise = runOcr();
    const assertion = expect(promise).rejects.toThrow(
      "OCR timed out with no progress. Try again or use a smaller image.",
    );
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.responseText = JSON.stringify({ jobId: "job-1", status: "queued" });
    xhr.onload?.();

    await vi.advanceTimersByTimeAsync(300_000);

    await assertion;
    expect(events.close).toHaveBeenCalledTimes(1);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      CANCEL_URL,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts a cancel once and aborts the request when a stall follows a progress frame and the 202 arrives later", async () => {
    vi.useFakeTimers();
    const promise = runOcr();
    const assertion = expect(promise).rejects.toThrow(
      "OCR timed out with no progress. Try again or use a smaller image.",
    );
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    events.emit({ type: "single", phase: "processing", percent: 30, stage: "Recognizing" });
    await vi.advanceTimersByTimeAsync(300_000);

    await assertion;
    expect(xhr.abort).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      CANCEL_URL,
      expect.objectContaining({ method: "POST" }),
    );

    xhr.status = 202;
    xhr.onload?.();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    xhr.status = 200;
    xhr.responseText = JSON.stringify({ text: "late sync" });
    xhr.onload?.();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("posts a cancel when a single frame without a numeric percent stalls", async () => {
    vi.useFakeTimers();
    const promise = runOcr();
    const assertion = expect(promise).rejects.toThrow(
      "OCR timed out with no progress. Try again or use a smaller image.",
    );
    const events = MockEventSource.instances[0];

    events.emit({ type: "single", phase: "processing", stage: "Queued" });
    await vi.advanceTimersByTimeAsync(300_000);

    await assertion;
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      CANCEL_URL,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts a cancel on stall even when aborting the request throws", async () => {
    vi.useFakeTimers();
    const promise = runOcr();
    promise.catch(() => {});
    const xhr = xhrs[0];
    xhr.status = 202;
    xhr.onload?.();
    xhr.abort.mockImplementation(() => {
      throw new Error("abort broke");
    });

    expect(() => vi.advanceTimersByTime(300_000)).toThrow("abort broke");
    await expect(promise).rejects.toThrow(
      "OCR timed out with no progress. Try again or use a smaller image.",
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      CANCEL_URL,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("posts a cancel and aborts the request when handling a progress frame throws", async () => {
    let stop: () => void = () => {};
    const promise = ocrOneFile(
      new File(["image"], "scan.png", { type: "image/png" }),
      { quality: "fast", language: "en", enhance: false },
      {
        onUploadProgress: vi.fn(),
        onProcessingProgress: () => {
          throw new Error("boom");
        },
        onStoppable: (s) => {
          stop = s;
        },
      },
    );
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    expect(() => events.emit({ type: "single", phase: "processing", percent: 40 })).toThrow("boom");
    await expect(promise).rejects.toThrow(
      "Something went wrong while tracking this job. Try again.",
    );
    expect(events.close).toHaveBeenCalledTimes(1);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      CANCEL_URL,
      expect.objectContaining({ method: "POST" }),
    );

    // Neither a late 202 nor a subsequent stop() sends a duplicate cancel.
    xhr.status = 202;
    xhr.onload?.();
    stop();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("does not cancel a job the server itself reported as failed, even when closing the stream throws", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.onload?.();
    events.close.mockImplementationOnce(() => {
      throw new Error("close broke");
    });

    expect(() =>
      events.emit({ type: "single", phase: "failed", error: "runtime crashed" }),
    ).toThrow("close broke");
    await expect(promise).rejects.toThrow("runtime crashed");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("still resolves and does not cancel when closing the stream throws on a completed frame", async () => {
    const promise = runOcr();
    const xhr = xhrs[0];
    const events = MockEventSource.instances[0];

    xhr.status = 202;
    xhr.onload?.();
    events.close.mockImplementationOnce(() => {
      throw new Error("close broke");
    });

    expect(() =>
      events.emit({ type: "single", phase: "complete", result: { text: "extracted text" } }),
    ).toThrow("close broke");
    await expect(promise).resolves.toMatchObject({ text: "extracted text" });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("sends at most one cancel when stop() is called after a stall", async () => {
    vi.useFakeTimers();
    let stop: () => void = () => {};
    const promise = runOcr((s) => {
      stop = s;
    });
    const assertion = expect(promise).rejects.toThrow(
      "OCR timed out with no progress. Try again or use a smaller image.",
    );
    const xhr = xhrs[0];
    xhr.status = 202;
    xhr.onload?.();

    await vi.advanceTimersByTimeAsync(300_000);
    await assertion;
    stop();

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("reports a cancel for an abandoned OCR job that finds no job", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 404 }));
      const promise = ocrOneFile(
        new File(["image"], "scan.png", { type: "image/png" }),
        { quality: "fast", language: "en", enhance: false },
        {
          onUploadProgress: vi.fn(),
          onProcessingProgress: () => {
            throw new Error("boom");
          },
        },
      );
      xhrs[0].status = 202;
      xhrs[0].onload?.();

      expect(() =>
        MockEventSource.instances[0].emit({ type: "single", phase: "processing", percent: 40 }),
      ).toThrow("boom");
      await expect(promise).rejects.toThrow(
        "Something went wrong while tracking this job. Try again.",
      );
      await vi.waitFor(() => expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1));

      expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
        "Cancel for an abandoned OCR job found no job",
      );
      expect(vi.mocked(captureHandledError).mock.calls[0][1]).toEqual({
        error_class: "operational",
        tool_id: "ocr",
        status_code: "404",
      });
    } finally {
      consoleWarn.mockRestore();
    }
  });
});
