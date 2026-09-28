// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeEraseObjectJobProgress } from "@/components/tools/erase-object-settings";
import { subscribeSignPdfJobProgress } from "@/components/tools/sign-pdf-settings";

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
    expect(onFailed).toHaveBeenCalledWith(
      "Something went wrong while tracking this job. Try again.",
    );
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
    expect(onFailed).toHaveBeenNthCalledWith(1, "server said no");
    expect(onFailed).toHaveBeenNthCalledWith(
      2,
      "Something went wrong while tracking this job. Try again.",
    );
    expect(FakeEventSource.instances[0].readyState).toBe(2);
  });

  it("ignores a malformed frame and keeps waiting", () => {
    const onComplete = vi.fn();
    const onFailed = vi.fn();
    const cleanup = subscribe("job-malformed", { onComplete, onFailed, onStall: vi.fn() });

    FakeEventSource.instances[0].onmessage?.({ data: "not json" });
    expect(onFailed).not.toHaveBeenCalled();

    FakeEventSource.instances[0].onmessage?.({
      data: JSON.stringify({ type: "single", phase: "complete", result: { ok: true } }),
    });
    expect(onComplete).toHaveBeenCalledWith({ ok: true });
    cleanup();
  });
});
