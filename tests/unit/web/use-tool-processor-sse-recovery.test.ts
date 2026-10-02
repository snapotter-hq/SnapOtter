// @vitest-environment jsdom

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
  parseApiError: () => "error",
}));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "11111111-1111-4111-8111-111111111111" };
});

import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: { onprogress?: unknown; onload?: unknown };
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

beforeEach(() => {
  vi.useFakeTimers();
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

describe("useToolProcessor SSE recovery", () => {
  it("reconnects after a transport stall and accepts the terminal replay", () => {
    const file = new File([new ArrayBuffer(64)], "photo.png", { type: "image/png" });
    useFileStore.getState().setFiles([file]);
    const { result, unmount } = renderHook(() => useToolProcessor("upscale"));

    act(() => {
      result.current.processFiles([file], {});
    });
    act(() => {
      xhrs[0].status = 202;
      xhrs[0].responseText = JSON.stringify({ jobId: "server-job", async: true });
      xhrs[0].onload?.();
    });

    expect(MockEventSource.instances).toHaveLength(1);
    expect(useFileStore.getState().activeJobId).toBe("11111111-1111-4111-8111-111111111111");

    act(() => {
      vi.advanceTimersByTime(300_001);
    });

    expect(MockEventSource.instances[0].close).toHaveBeenCalledOnce();
    expect(MockEventSource.instances).toHaveLength(2);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
    expect(useFileStore.getState().activeJobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(useFileStore.getState().entries[0].status).toBe("processing");

    act(() => {
      vi.advanceTimersByTime(300_001);
    });

    expect(MockEventSource.instances[1].close).toHaveBeenCalledOnce();
    expect(MockEventSource.instances).toHaveLength(3);
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      MockEventSource.instances[2].onmessage?.({
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          percent: 100,
          result: {
            jobId: "server-job",
            downloadUrl: "/api/v1/download/server-job/upscaled.png",
            originalSize: 64,
            processedSize: 128,
          },
        }),
      } as MessageEvent);
    });

    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().activeJobId).toBeNull();
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "/api/v1/download/server-job/upscaled.png",
      processedSize: 128,
    });

    unmount();
  });

  // #1287: the onmessage catch used to wrap the whole handler, so a throw
  // while handling a completion frame was swallowed and the run sat at
  // "processing" until the stall timer, which only reconnected into the same
  // throw. Only a malformed frame may be ignored; a handling error fails the
  // run with a real message and still surfaces.
  describe("handler errors (#1287)", () => {
    const HANDLER_FAILURE = "Something went wrong while tracking this job. Try again.";
    const COMPLETE_FRAME = {
      data: JSON.stringify({
        type: "single",
        phase: "complete",
        percent: 100,
        result: {
          jobId: "server-job",
          downloadUrl: "/api/v1/download/server-job/upscaled.png",
          originalSize: 64,
          processedSize: 128,
        },
      }),
    } as MessageEvent;
    // Zustand copies state on every set, so a spy on getState().updateEntry
    // rides along into later states; put the real action back explicitly.
    const realUpdateEntry = useFileStore.getState().updateEntry;
    afterEach(() => {
      useFileStore.setState({ updateEntry: realUpdateEntry });
    });

    function startRun(opts: { async: boolean }) {
      const file = new File([new ArrayBuffer(64)], "photo.png", { type: "image/png" });
      useFileStore.getState().setFiles([file]);
      const hook = renderHook(() => useToolProcessor("upscale"));
      act(() => {
        hook.result.current.processFiles([file], {});
      });
      if (opts.async) {
        act(() => {
          xhrs[0].status = 202;
          xhrs[0].responseText = JSON.stringify({ jobId: "server-job", async: true });
          xhrs[0].onload?.();
        });
      }
      return hook;
    }

    it("fails an async run with a real message when completion handling throws", () => {
      const { unmount } = startRun({ async: true });
      vi.spyOn(useFileStore.getState(), "updateEntry")
        .mockImplementationOnce(() => {
          throw new Error("boom");
        })
        .mockImplementation(realUpdateEntry);

      expect(() =>
        act(() => {
          MockEventSource.instances[0].onmessage?.(COMPLETE_FRAME);
        }),
      ).toThrow("boom");

      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: HANDLER_FAILURE,
      });
      expect(MockEventSource.instances[0].close).toHaveBeenCalled();

      // Settled for good: the stall timer must not reconnect into the same throw.
      act(() => {
        vi.advanceTimersByTime(600_001);
      });
      expect(MockEventSource.instances).toHaveLength(1);
      expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);

      unmount();
    });

    it("settles a sync run even when every store write keeps throwing", () => {
      const { unmount } = startRun({ async: false });
      vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation(() => {
        throw new Error("boom");
      });

      // The original error is the one that surfaces, not the failed settle.
      expect(() =>
        act(() => {
          MockEventSource.instances[0].onmessage?.(COMPLETE_FRAME);
        }),
      ).toThrow("boom");

      expect(xhrs[0].abort).toHaveBeenCalled();
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().activeJobId).toBeNull();
      expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);

      unmount();
    });

    it("still ends the run when the failed-frame settle throws", () => {
      const { unmount } = startRun({ async: true });
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.spyOn(useFileStore.getState(), "updateEntry")
        .mockImplementationOnce(() => {
          throw new Error("boom");
        })
        .mockImplementation(realUpdateEntry);

      try {
        // The entry settle runs after the teardown and logs its throw
        // (#1698), so the run ends on the server's own error instead of
        // falling into the generic frame-handling one.
        act(() => {
          MockEventSource.instances[0].onmessage?.({
            data: JSON.stringify({ type: "single", phase: "failed", error: "server said no" }),
          } as MessageEvent);
        });

        expect(useFileStore.getState().processing).toBe(false);
        expect(useFileStore.getState().activeJobId).toBeNull();
        expect(useFileStore.getState().error).toBe("server said no");
        expect(consoleError).toHaveBeenCalledWith(
          "Failing the run's entry failed",
          expect.objectContaining({ message: "boom" }),
        );
        expect(MockEventSource.instances[0].close).toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
        unmount();
      }
    });

    it("rethrows the root cause when the teardown itself throws", () => {
      const { unmount } = startRun({ async: true });
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      // A store listener that breaks on every write: the completion write
      // throws the root cause, then the teardown's first write throws again.
      let writes = 0;
      const unsubscribe = useFileStore.subscribe(() => {
        writes++;
        throw new Error(writes === 1 ? "root cause" : "teardown broke");
      });

      try {
        expect(() =>
          act(() => {
            MockEventSource.instances[0].onmessage?.(COMPLETE_FRAME);
          }),
        ).toThrow("root cause");
        expect(consoleError).toHaveBeenCalledWith(
          "SSE teardown after a frame handling error failed",
          expect.objectContaining({ message: "teardown broke" }),
        );
      } finally {
        unsubscribe();
        consoleError.mockRestore();
        unmount();
      }
    });

    // #1739: the completion branch set the payload and warning before its
    // store writes, so a write that threw left tools that render straight
    // from resultPayload (histogram, sprite sheet, LQIP) showing a finished
    // result beside the tracking error. The sync path (#1354) already sets
    // them last.
    describe("result payload on a failed landing (#1739)", () => {
      const WARNED_FRAME = {
        data: JSON.stringify({
          type: "single",
          phase: "complete",
          percent: 100,
          result: {
            jobId: "server-job",
            downloadUrl: "/api/v1/download/server-job/upscaled.png",
            originalSize: 64,
            processedSize: 128,
            savedFileId: "saved-file",
            warning: "Output was clamped",
          },
        }),
      } as MessageEvent;
      const realMarkClaimed = useFileStore.getState().markClaimed;
      afterEach(() => {
        useFileStore.setState({ markClaimed: realMarkClaimed });
      });

      it("shows no payload or warning when the entry write throws", () => {
        const { result, unmount } = startRun({ async: true });
        vi.spyOn(useFileStore.getState(), "updateEntry")
          .mockImplementationOnce(() => {
            throw new Error("boom");
          })
          .mockImplementation(realUpdateEntry);

        expect(() =>
          act(() => {
            MockEventSource.instances[0].onmessage?.(WARNED_FRAME);
          }),
        ).toThrow("boom");
        // act skips its flush when the callback throws.
        act(() => {});

        expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
        expect(useFileStore.getState().entries[0].status).toBe("failed");
        expect(result.current.resultPayload).toBeNull();
        expect(result.current.warning).toBeNull();

        unmount();
      });

      it("shows no payload or warning when marking the auto-saved result claimed throws", () => {
        const { result, unmount } = startRun({ async: true });
        vi.spyOn(useFileStore.getState(), "markClaimed").mockImplementation(() => {
          throw new Error("claim broke");
        });

        expect(() =>
          act(() => {
            MockEventSource.instances[0].onmessage?.(WARNED_FRAME);
          }),
        ).toThrow("claim broke");
        act(() => {});

        expect(useFileStore.getState().processing).toBe(false);
        expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
        expect(result.current.resultPayload).toBeNull();
        expect(result.current.warning).toBeNull();
        // The result did land before the claim threw, so the entry keeps it
        // (the sync path's failEntry does the same).
        expect(useFileStore.getState().entries[0].status).toBe("completed");

        unmount();
      });

      it("drops the payload when ending the run throws after it was set", () => {
        const { result, unmount } = startRun({ async: true });
        // clearActiveJob nulls the job ref before its store write, so a
        // listener that throws on that write leaves processing on and the
        // handler-error teardown still has a live run to fail.
        const unsubscribe = useFileStore.subscribe((state, prev) => {
          if (prev.activeJobId && !state.activeJobId) throw new Error("teardown write broke");
        });

        try {
          expect(() =>
            act(() => {
              MockEventSource.instances[0].onmessage?.(WARNED_FRAME);
            }),
          ).toThrow("teardown write broke");
          act(() => {});

          expect(useFileStore.getState().processing).toBe(false);
          expect(useFileStore.getState().error).toBe(HANDLER_FAILURE);
          expect(result.current.resultPayload).toBeNull();
          expect(result.current.warning).toBeNull();
        } finally {
          unsubscribe();
          unmount();
        }
      });

      it("shows the payload and warning once a completion lands", () => {
        const { result, unmount } = startRun({ async: true });

        act(() => {
          MockEventSource.instances[0].onmessage?.(WARNED_FRAME);
        });

        expect(useFileStore.getState().processing).toBe(false);
        expect(useFileStore.getState().error).toBeNull();
        expect(useFileStore.getState().entries[0]).toMatchObject({
          status: "completed",
          claimed: true,
        });
        expect(result.current.resultPayload).toMatchObject({
          downloadUrl: "/api/v1/download/server-job/upscaled.png",
          savedFileId: "saved-file",
        });
        expect(result.current.warning).toBe("Output was clamped");

        unmount();
      });
    });

    it("still ignores a malformed frame", () => {
      const { unmount } = startRun({ async: true });

      act(() => {
        MockEventSource.instances[0].onmessage?.({ data: "not json" } as MessageEvent);
      });

      expect(useFileStore.getState().processing).toBe(true);
      expect(useFileStore.getState().error).toBeNull();
      expect(useFileStore.getState().entries[0].status).toBe("processing");

      // The run carries on and settles from the next good frame.
      act(() => {
        MockEventSource.instances[0].onmessage?.(COMPLETE_FRAME);
      });
      expect(useFileStore.getState().entries[0].status).toBe("completed");

      unmount();
    });
  });
});
