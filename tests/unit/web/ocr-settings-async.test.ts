// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ formatHeaders: () => [] }));
vi.mock("@/lib/utils", () => ({
  copyToClipboard: vi.fn(),
  generateId: () => "11111111-1111-4111-8111-111111111111",
}));

import { ocrOneFile } from "@/components/tools/ocr-settings";

interface MockXhr {
  status: number;
  responseText: string;
  upload: { onprogress?: (event: ProgressEvent) => void };
  onload?: () => void;
  onerror?: () => void;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
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

function runOcr() {
  return ocrOneFile(
    new File(["image"], "scan.png", { type: "image/png" }),
    { quality: "fast", language: "en", enhance: false },
    { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn() },
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

    await expect(promise).resolves.toBe("queued OCR text");
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
    await expect(promise).resolves.toBe("fast worker result");

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

    await expect(promise).resolves.toBe("sync OCR text");
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
    await expect(promise).resolves.toBe("still queued safely");
  });
});
