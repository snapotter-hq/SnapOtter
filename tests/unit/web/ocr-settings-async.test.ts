// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  formatHeaders: () => [],
}));
vi.mock("@/lib/utils", () => ({
  copyToClipboard: vi.fn(),
  generateId: () => "11111111-1111-4111-8111-111111111111",
}));

import { ocrOneFile } from "@/components/tools/ocr-settings";

interface MockXhr {
  status: number;
  responseText: string;
  upload: { onprogress?: (event: ProgressEvent) => void; onload?: () => void };
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
  vi.stubGlobal("EventSource", MockEventSource);
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

  // The server has the whole body but hasn't answered: it may be validating and
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
