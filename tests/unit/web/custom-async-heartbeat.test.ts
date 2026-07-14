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
});
