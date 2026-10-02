// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { subscribeEraseObjectJobProgress } from "@/components/tools/erase-object-settings";
import { subscribeSignPdfJobProgress } from "@/components/tools/sign-pdf-settings";
import { captureHandledError } from "@/lib/analytics";

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

const subscribers = [
  ["erase-object", subscribeEraseObjectJobProgress],
  ["sign-pdf", subscribeSignPdfJobProgress],
] as const;

describe.each(subscribers)("%s async progress", (_name, subscribe) => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.mocked(captureHandledError).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resets the stall timeout when the server sends a heartbeat", () => {
    const onStall = vi.fn();
    const cleanup = subscribe("job-heartbeat", {
      onComplete: vi.fn(),
      onFailed: vi.fn(),
      onStall,
    });

    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(4 * 60_000 + 59_000);

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "heartbeat" }),
    });
    vi.advanceTimersByTime(2_000);

    expect(onStall).not.toHaveBeenCalled();

    vi.advanceTimersByTime(4 * 60_000 + 59_000);
    expect(onStall).toHaveBeenCalledOnce();
    cleanup();
  });

  // #1287: the onmessage catch used to wrap the whole handler. A throw from
  // onComplete was swallowed after cleanup() had already closed the stream
  // and cleared the stall timer, so the tool sat at "processing" for good.
  it("fails the run and rethrows when completion handling throws", () => {
    const onFailed = vi.fn();
    const onStall = vi.fn();
    subscribe("job-throw", {
      onComplete: () => {
        throw new Error("boom");
      },
      onFailed,
      onStall,
    });

    expect(() =>
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          result: { downloadUrl: "/api/v1/download/job-throw/out.png" },
        }),
      }),
    ).toThrow("boom");

    expect(onFailed).toHaveBeenCalledOnce();
    // A reason, not text: this function has no locale, so the component
    // translates it (#1593).
    expect(onFailed).toHaveBeenCalledWith({ reason: "trackingFailed" });
    expect(FakeEventSource.instances[0].readyState).toBe(2);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("rethrows the original error when onFailed itself throws", () => {
    const onFailed = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("onFailed broke");
      })
      .mockImplementation(() => {
        throw new Error("second onFailed");
      });
    subscribe("job-failed-throw", { onComplete: vi.fn(), onFailed, onStall: vi.fn() });

    expect(() =>
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "failed", error: "server said no" }),
      }),
    ).toThrow("onFailed broke");
    expect(onFailed).toHaveBeenNthCalledWith(1, { message: "server said no" });
    expect(onFailed).toHaveBeenNthCalledWith(2, { reason: "trackingFailed" });
    expect(FakeEventSource.instances[0].readyState).toBe(2);
  });

  it("passes the server's own error through as the failure message", () => {
    const onFailed = vi.fn();
    subscribe("job-failed", { onComplete: vi.fn(), onFailed, onStall: vi.fn() });

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({
        type: "single",
        phase: "failed",
        error: "Signature box is off the page",
      }),
    });

    expect(onFailed).toHaveBeenCalledWith({ message: "Signature box is off the page" });
  });

  // #1593: this used to hand onFailed the English "Processing failed", which
  // the component showed as-is in every locale.
  it("reports a failed frame with no error text as a reason, not English", () => {
    const onFailed = vi.fn();
    subscribe("job-failed-bare", { onComplete: vi.fn(), onFailed, onStall: vi.fn() });

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "single", phase: "failed" }),
    });

    expect(onFailed).toHaveBeenCalledWith({ reason: "noDetail" });
  });

  it("treats a blank server error as no detail instead of showing nothing", () => {
    // The worker publishes error: "" when a handler throws an Error with no text.
    const onFailed = vi.fn();
    subscribe("job-failed-blank", { onComplete: vi.fn(), onFailed, onStall: vi.fn() });

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "single", phase: "failed", error: "  " }),
    });

    expect(onFailed).toHaveBeenCalledWith({ reason: "noDetail" });
  });

  // #1830 split "complete with no result" off the progress branch; a running
  // job's progress frame must still only report progress.
  it("passes a progress frame through without ending the run", () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const onFailed = vi.fn();
    const cleanup = subscribe("job-progress", {
      onProgress,
      onComplete,
      onFailed,
      onStall: vi.fn(),
    });

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "single", phase: "processing", percent: 40 }),
    });

    expect(onProgress).toHaveBeenCalledWith(40);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.OPEN);
    cleanup();
  });

  it("ignores a malformed frame and keeps waiting", () => {
    const onComplete = vi.fn();
    const onFailed = vi.fn();
    const cleanup = subscribe("job-malformed", { onComplete, onFailed, onStall: vi.fn() });

    FakeEventSource.instances[0].onmessage?.({ data: "not json" });
    expect(onFailed).not.toHaveBeenCalled();

    const result = { downloadUrl: "/api/v1/download/job-malformed/out.png" };
    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "single", phase: "complete", result }),
    });
    expect(onComplete).toHaveBeenCalledWith(result);
    cleanup();
  });
});

// #1830: Erase Object checks a completed frame's result the way the shared
// hooks do since #1794. Sign PDF checks it in its component's landResult.
describe("erase-object async progress: a completed frame with nothing to download", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.mocked(captureHandledError).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ["an empty result", { result: {} }],
    ["a non-string download URL", { result: { downloadUrl: 42 } }],
    ["an array result", { result: [] }],
    ["no result at all", {}],
  ])("fails the run as an invalid response for %s", (_label, extra) => {
    const onComplete = vi.fn();
    const onFailed = vi.fn();
    const onStall = vi.fn();
    subscribeEraseObjectJobProgress("job-empty", { onComplete, onFailed, onStall });

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "single", phase: "complete", ...extra }),
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledOnce();
    expect(onFailed).toHaveBeenCalledWith({ reason: "invalidResponse" });
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances[0].readyState).toBe(2);
    // The run is over: the stall timer went with the stream.
    vi.advanceTimersByTime(10 * 60_000);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("rethrows a throw from onFailed without relabelling it as a tracking failure", () => {
    const onFailed = vi.fn(() => {
      throw new Error("onFailed broke");
    });
    subscribeEraseObjectJobProgress("job-empty-throw", {
      onComplete: vi.fn(),
      onFailed,
      onStall: vi.fn(),
    });

    expect(() =>
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
      }),
    ).toThrow("onFailed broke");
    expect(onFailed).toHaveBeenCalledOnce();
    expect(onFailed).toHaveBeenCalledWith({ reason: "invalidResponse" });
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledOnce();
  });

  it("ignores a completed frame of another kind", () => {
    const onComplete = vi.fn();
    const onFailed = vi.fn();
    const cleanup = subscribeEraseObjectJobProgress("job-batch-frame", {
      onComplete,
      onFailed,
      onStall: vi.fn(),
    });

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "batch", phase: "complete" }),
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onFailed).not.toHaveBeenCalled();
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.OPEN);
    cleanup();
  });
});
