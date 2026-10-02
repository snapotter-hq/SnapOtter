// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));

import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { captureHandledError } from "@/lib/analytics";
import { useFileStore } from "@/stores/file-store";

/**
 * Erase Object hand-rolls its requests, single file and batch alike, so
 * nothing in useToolProcessor answers for them. These pin how each sync 2xx
 * answer tells a body that isn't a result (the server's fault) apart from a
 * throw while landing a good one (ours), the split #1354 made for the tool,
 * pipeline and Sign PDF handlers (#1734).
 */

const DOWNLOAD_URL = "/api/v1/download/job-1/photo.png";
const GOOD_BODY = { downloadUrl: DOWNLOAD_URL, originalSize: 1000, processedSize: 900 };

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
  upload: { onprogress: unknown; onload: unknown } = { onprogress: null, onload: null };
  url = "";

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(_key: string, _value: string) {}

  send(_body: FormData) {}

  respond(status: number, body: unknown) {
    this.respondRaw(status, JSON.stringify(body));
  }

  respondRaw(status: number, text: string) {
    act(() => {
      this.status = status;
      this.responseText = text;
      this.onload?.();
    });
  }
}

function image(name: string): File {
  return new File(["png"], name, { type: "image/png" });
}

function entry(index = 0) {
  return useFileStore.getState().entries[index];
}

function fakeEraser(): EraserCanvasRef {
  const mask = () => new Blob(["mask"], { type: "image/png" });
  return {
    exportMask: async () => mask(),
    exportAllMasks: async () =>
      new Map(useFileStore.getState().entries.map((e) => [e.blobUrl, mask()] as const)),
    getMaskCenter: () => null,
    clear: vi.fn(),
    clearAll: vi.fn(),
    undo: vi.fn(),
  };
}

function renderPanel(maskedFileCount = 1) {
  return render(
    <EraseObjectSettings
      eraserRef={{ current: fakeEraser() }}
      hasStrokes
      brushSize={30}
      onBrushSizeChange={vi.fn()}
      mode="brush"
      onModeChange={vi.fn()}
      maskedFileCount={maskedFileCount}
    />,
  );
}

/** Click submit and wait for the request the handler fires after its export. */
async function submit(count = 1): Promise<FakeXhr> {
  fireEvent.click(screen.getByTestId("erase-object-submit"));
  await waitFor(() => expect(FakeXhr.instances).toHaveLength(count));
  return FakeXhr.instances[count - 1];
}

const realUpdateEntry = useFileStore.getState().updateEntry;

/**
 * The next updateEntry throws, as a broken store write would; later ones work.
 * Call it once the request is out: from there the first entry write is the one
 * landing the result. The rethrow test below leans on the same order.
 */
function breakNextEntryWrite() {
  vi.spyOn(useFileStore.getState(), "updateEntry")
    .mockImplementationOnce(() => {
      throw new Error("boom");
    })
    .mockImplementation(realUpdateEntry);
}

function expectReported(message: string, statusCode: number | undefined) {
  expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
  const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
  expect(error.message).toBe(message);
  expect(error.cause).toBeUndefined();
  expect((error as { statusCode?: number }).statusCode).toBe(statusCode);
  expect(tags).toEqual({ error_class: "operational", tool_id: "erase-object" });
}

let blobCount = 0;

beforeEach(() => {
  // Batch runs map masks back to entries by blob URL, so each needs its own.
  blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  FakeXhr.instances = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(captureHandledError).mockClear();
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([image("photo.png")]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.setState({ updateEntry: realUpdateEntry });
  useFileStore.getState().reset();
});

describe("erase-object single file: its own failures apart from a bad response", () => {
  it("lands a good result", async () => {
    renderPanel();

    (await submit()).respond(200, GOOD_BODY);

    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(entry().status).toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("claims an auto-saved result and links it on overwrite", async () => {
    useFileStore.getState().setLibrarySaveMode("overwrite");
    useFileStore.getState().updateEntry(0, { serverFileId: "file-1" });
    renderPanel();

    (await submit()).respond(200, { ...GOOD_BODY, savedFileId: "file-2" });

    expect(useFileStore.getState().lastSavedLibraryFileId).toBe("file-2");
    expect(entry().serverFileId).toBe("file-2");
    expect(entry().claimed).toBe(true);
  });

  it("ends the run with the tracking message when landing the result throws", async () => {
    renderPanel();
    const xhr = await submit();
    breakNextEntryWrite();

    expect(() => xhr.respond(200, GOOD_BODY)).toThrow("boom");
    // act() skips its flush when the callback throws; let the render land.
    await act(async () => {});

    expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
    expect(screen.queryByText(en.errors.invalidResponse)).not.toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
    expect(screen.getByTestId("erase-object-submit")).toBeEnabled();
    // Our bug, not a malformed answer: the rethrow reaches Sentry instead.
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("rethrows the root cause when ending the run throws too", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPanel();
    const xhr = await submit();
    // A store listener that breaks on every write: landing the result throws
    // the root cause, then each of the teardown's store writes throws again.
    let writes = 0;
    const unsubscribe = useFileStore.subscribe(() => {
      writes++;
      if (writes === 1) throw new Error("root cause");
      throw new Error(writes === 2 ? "teardown broke" : "later teardown broke");
    });
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    try {
      expect(() => xhr.respond(200, GOOD_BODY)).toThrow("root cause");
      await act(async () => {});

      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a result handling error failed",
        expect.objectContaining({ message: "teardown broke" }),
      );
      // zustand sets the state before its listeners run, so each write landed
      // even though a listener threw.
      expect(useFileStore.getState().error).toBe(en.errors.jobTrackingFailed);
      expect(useFileStore.getState().processing).toBe(false);
      // The UI teardown still ran after setError threw: the elapsed counter
      // stops instead of ticking for as long as the page is open.
      expect(clearIntervalSpy).toHaveBeenCalled();
      // Both teardown writes threw; the run reports once, with the first
      // (#1882). The root cause is rethrown, so it isn't reported here.
      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a result handling error failed",
        expect.objectContaining({ message: "later teardown broke" }),
      );
      const reports = vi
        .mocked(captureHandledError)
        .mock.calls.filter(
          ([e]) => e.message === "Ending an Erase Object run after a result handling error failed",
        );
      expect(reports).toHaveLength(1);
      expect(reports[0][0].cause).toMatchObject({ message: "teardown broke" });
      expect(reports[0][1]).toEqual({ error_class: "bug", tool_id: "erase-object" });
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    } finally {
      clearIntervalSpy.mockRestore();
      unsubscribe();
      consoleError.mockRestore();
    }
  });

  it.each([
    ["a JSON null body", null, "Tool result body is not a JSON object"],
    ["a JSON string body", "ok", "Tool result body is not a JSON object"],
    ["an empty object", {}, "Tool result has no download URL"],
  ])("says the response was invalid, and reports it, for %s", async (_label, body, message) => {
    renderPanel();

    (await submit()).respond(200, body);

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(entry().status).not.toBe("completed");
    expect(useFileStore.getState().processing).toBe(false);
    expectReported(message, 200);
  });

  it("reports a malformed body even when showing the error throws", async () => {
    renderPanel();
    const xhr = await submit();
    const unsubscribe = useFileStore.subscribe(() => {
      throw new Error("store broke");
    });

    try {
      expect(() => xhr.respond(200, {})).toThrow("store broke");
      expectReported("Tool result has no download URL", 200);
    } finally {
      unsubscribe();
    }
  });

  it("reports a body that does not parse without its text", async () => {
    renderPanel();

    (await submit()).respondRaw(200, "<html>secret-token</html>");

    expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
    expectReported("Tool result body is not a JSON object", 200);
  });
});

describe("erase-object batch: its own failures apart from a bad response", () => {
  beforeEach(() => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
  });

  it("lands a good result on each entry", async () => {
    renderPanel(2);

    (await submit(1)).respond(200, GOOD_BODY);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, GOOD_BODY);

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(entry(0).status).toBe("completed");
    expect(entry(1).status).toBe("completed");
  });

  it("fails the entry with the tracking message when landing its result throws", async () => {
    renderPanel(2);
    const first = await submit(1);
    breakNextEntryWrite();

    expect(() => first.respond(200, GOOD_BODY)).toThrow("boom");
    // act() skips its flush when the callback throws; reset it before going on.
    await act(async () => {});
    // The batch moves on to the next file once the first one settles.
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, GOOD_BODY);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(entry(0).status).toBe("failed");
    expect(entry(0).error).toBe(en.errors.jobTrackingFailed);
    expect(entry(1).status).toBe("completed");
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("fails the entry as an invalid response, and reports it, for a body with no result", async () => {
    renderPanel(2);

    (await submit(1)).respond(200, {});
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, GOOD_BODY);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(entry(0).status).toBe("failed");
    expect(entry(0).error).toBe(en.errors.invalidResponse);
    expect(entry(0).processedUrl).toBeNull();
    expectReported("Tool result has no download URL", 200);
  });
});

describe("erase-object single file: every other way the request ends", () => {
  it("shows the server's error text for a failed request", async () => {
    renderPanel();

    (await submit()).respond(422, { error: "Object erasing failed" });

    expect(screen.getByText("Object erasing failed")).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("falls back to the details when there is no error text", async () => {
    renderPanel();

    (await submit()).respond(422, { details: "Not enough memory" });

    expect(screen.getByText("Not enough memory")).toBeInTheDocument();
  });

  it("names the status when a failed request's body does not parse", async () => {
    renderPanel();

    (await submit()).respondRaw(502, "<html>Bad Gateway</html>");

    expect(screen.getByText("Processing failed: 502")).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("says so on a network error", async () => {
    renderPanel();
    const xhr = await submit();

    act(() => xhr.onerror?.());

    expect(screen.getByText(en.errors.network)).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("says so when the request times out", async () => {
    renderPanel();
    const xhr = await submit();

    act(() => xhr.ontimeout?.());

    expect(screen.getByText(en.toolSettings["erase-object"].timeoutOverloaded)).toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("lands an async result through the progress stream", async () => {
    renderPanel();
    const xhr = await submit();

    xhr.respond(202, { jobId: "job-1", async: true });
    expect(useFileStore.getState().processing).toBe(true);
    act(() => {
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: GOOD_BODY }),
      });
    });

    expect(entry().processedUrl).toBe(DOWNLOAD_URL);
    expect(useFileStore.getState().processing).toBe(false);
  });
});

/** Answer the request with a 202, then send one frame on the progress stream. */
function goAsyncThenSend(xhr: FakeXhr, frame: unknown, stream = 0) {
  xhr.respond(202, { jobId: "job-1", async: true });
  act(() => {
    FakeEventSource.instances[stream].onmessage?.({ data: JSON.stringify(frame) });
  });
}

// A completed frame's result is the worker's buildLegacyResultPayload, which
// always carries a downloadUrl, so one without it is the server's bug: the
// stream twin of a sync 200 {} (#1740), closed for the shared hooks in #1794.
const NOTHING_TO_DOWNLOAD = [
  ["an empty result", { result: {} }, "Tool result has no download URL"],
  ["an empty download URL", { result: { downloadUrl: "" } }, "Tool result has no download URL"],
  ["a null result", { result: null }, "Tool result body is not a JSON object"],
  ["no result at all", {}, "Tool result body is not a JSON object"],
] as const;

describe("erase-object single file: a completed frame with nothing to download (#1830)", () => {
  it.each(NOTHING_TO_DOWNLOAD)(
    "fails the run, and reports it once, for %s",
    async (_label, extra, message) => {
      renderPanel();

      goAsyncThenSend(await submit(), { type: "single", phase: "complete", ...extra });

      expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();
      expect(entry().status).not.toBe("completed");
      expect(entry().processedUrl).toBeNull();
      expect(useFileStore.getState().processing).toBe(false);
      expect(screen.getByTestId("erase-object-submit")).toBeEnabled();
      // A progress frame has no HTTP status to tag.
      expectReported(message, undefined);
    },
  );

  it("keeps the invalid-response error, reported once, when showing it throws", async () => {
    renderPanel();
    const xhr = await submit();
    xhr.respond(202, { jobId: "job-1", async: true });
    const unsubscribe = useFileStore.subscribe(() => {
      throw new Error("store broke");
    });
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

    try {
      expect(() =>
        FakeEventSource.instances[0].onmessage?.({
          data: JSON.stringify({ type: "single", phase: "complete", result: {} }),
        }),
      ).toThrow("store broke");
      // zustand sets the state before its listeners run. The server's fault
      // stays the error: it is not relabelled as our own tracking failure.
      expect(useFileStore.getState().error).toBe(en.errors.invalidResponse);
      expectReported("Tool result has no download URL", undefined);
      // The stream already let go of the run, so the teardown must still run
      // or it sits at processing for good.
      expect(useFileStore.getState().processing).toBe(false);
      expect(clearIntervalSpy).toHaveBeenCalled();
    } finally {
      clearIntervalSpy.mockRestore();
      unsubscribe();
    }
  });

  it("still reads a throw while landing a good frame as ours", async () => {
    renderPanel();
    const xhr = await submit();
    xhr.respond(202, { jobId: "job-1", async: true });
    breakNextEntryWrite();

    expect(() =>
      FakeEventSource.instances[0].onmessage?.({
        data: JSON.stringify({ type: "single", phase: "complete", result: GOOD_BODY }),
      }),
    ).toThrow("boom");
    await act(async () => {});

    expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });
});

describe("erase-object batch: a completed frame with nothing to download (#1830)", () => {
  beforeEach(() => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
  });

  it.each(NOTHING_TO_DOWNLOAD)(
    "fails the file, and reports it once, for %s",
    async (_label, extra, message) => {
      renderPanel(2);

      goAsyncThenSend(await submit(1), { type: "single", phase: "complete", ...extra });
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      FakeXhr.instances[1].respond(200, GOOD_BODY);
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      expect(entry(0).status).toBe("failed");
      expect(entry(0).error).toBe(en.errors.invalidResponse);
      expect(entry(0).processedUrl).toBeNull();
      expect(entry(1).status).toBe("completed");
      expectReported(message, undefined);
    },
  );

  it("lands a good frame on the file", async () => {
    renderPanel(2);

    goAsyncThenSend(await submit(1), { type: "single", phase: "complete", result: GOOD_BODY });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, GOOD_BODY);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(entry(0).status).toBe("completed");
    expect(entry(0).processedUrl).toBe(DOWNLOAD_URL);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });
});

describe("erase-object batch: every other way a file's request ends", () => {
  beforeEach(() => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
  });

  async function runFirstThenFinish(answerFirst: (xhr: FakeXhr) => void) {
    renderPanel(2);
    answerFirst(await submit(1));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, GOOD_BODY);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
  }

  it("fails the file with the server's error text", async () => {
    await runFirstThenFinish((xhr) => xhr.respond(422, { error: "Object erasing failed" }));

    expect(entry(0).status).toBe("failed");
    expect(entry(0).error).toBe("Object erasing failed");
    expect(entry(1).status).toBe("completed");
  });

  it("names the status when a failed request's body does not parse", async () => {
    await runFirstThenFinish((xhr) => xhr.respondRaw(502, "<html>Bad Gateway</html>"));

    expect(entry(0).error).toBe("Processing failed: 502");
  });

  it("fails the file on a network error", async () => {
    await runFirstThenFinish((xhr) => act(() => xhr.onerror?.()));

    expect(entry(0).error).toBe(en.errors.network);
  });

  it("fails the file as a timeout when the request times out", async () => {
    await runFirstThenFinish((xhr) => act(() => xhr.ontimeout?.()));

    expect(entry(0).error).toBe(en.errors.requestTimedOut);
    expect(entry(0).errorCategory).toBe("timeout");
  });
});

/**
 * A batch leaves its click handler as a rejection when a store write keeps
 * throwing. Takes that over from vitest until `restore`, so a test can assert
 * on it instead of failing the run (the same takeover as the Collage tests in
 * own-parse-tools-result-reporting). Call `restore` in a finally that starts
 * right after this, or vitest's listener stays gone.
 */
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

/**
 * Watches the batch's elapsed counter: the one 1000 ms interval the panel
 * starts. Testing Library's waitFor starts and clears its own intervals, so
 * only a clear of this handle proves the counter stopped.
 */
function watchElapsedInterval() {
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const handles: ReturnType<typeof setInterval>[] = [];
  const setSpy = vi.spyOn(globalThis, "setInterval").mockImplementation(((
    handler: () => void,
    ms?: number,
  ) => {
    const handle = realSetInterval(handler, ms);
    if (ms === 1000) handles.push(handle);
    return handle;
  }) as typeof setInterval);
  const clearSpy = vi.spyOn(globalThis, "clearInterval");
  return {
    handles,
    clearSpy,
    realClearInterval,
    expectCleared() {
      expect(handles).toHaveLength(1);
      expect(clearSpy).toHaveBeenCalledWith(handles[0]);
    },
    restore() {
      setSpy.mockRestore();
      clearSpy.mockRestore();
      for (const handle of handles) realClearInterval(handle);
    },
  };
}

describe("erase-object batch: a store that keeps throwing (#1810)", () => {
  beforeEach(() => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
  });

  it("ends the batch when failing a file's entry throws too", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = takeOverUnhandledRejections();
    const elapsed = watchElapsedInterval();
    try {
      renderPanel(2);
      const first = await submit(1);
      // Every entry write from here on throws before it lands: landing the
      // result, failing the entry in handleProcessAll's catch, and the
      // teardown's attempt to settle the file it left at "processing".
      const thrown: Error[] = [];
      vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation((_index, patch) => {
        const err = new Error(`write ${patch.status}`);
        thrown.push(err);
        throw err;
      });

      expect(() => first.respond(200, GOOD_BODY)).toThrow("write completed");
      await act(async () => {});

      await waitFor(() => expect(unhandled.rejections).toHaveLength(1));
      expect(thrown.map((err) => err.message)).toEqual([
        "write completed",
        "write failed",
        "write failed",
      ]);
      // The catch's failed write is the root cause, and it surfaces.
      expect(unhandled.rejections[0]).toBe(thrown[1]);
      expect(useFileStore.getState().processing).toBe(false);
      elapsed.expectCleared();
      expect(screen.getByTestId("erase-object-submit")).toBeEnabled();
      expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument();
      // A store that can't record a failure gets no more files sent to it.
      expect(FakeXhr.instances).toHaveLength(1);
      // The settle behind it threw too and would be lost to the rethrow, so
      // it is reported, once. The store never took a write, so the file is
      // still at "processing": nothing could have moved it.
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
      const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
      expect(error.message).toBe("Ending an Erase Object batch after a store error failed");
      expect(error.cause).toBe(thrown[2]);
      expect(tags).toEqual({ error_class: "bug", tool_id: "erase-object" });
      expect(entry(0).status).toBe("processing");
    } finally {
      elapsed.restore();
      unhandled.restore();
      consoleError.mockRestore();
    }
  });

  it("rethrows the root cause and reports the teardown's first throw once", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = takeOverUnhandledRejections();
    const elapsed = watchElapsedInterval();
    let unsubscribe = () => {};
    try {
      renderPanel(2);
      const first = await submit(1);
      // A store listener that breaks on every write, named for the write it
      // saw. zustand sets the state before its listeners run, so each write
      // lands and then throws.
      unsubscribe = useFileStore.subscribe((state, prev) => {
        const was = prev.entries[0]?.status;
        const now = state.entries[0]?.status;
        if (was !== now) throw new Error(`entry ${now}`);
        if (prev.processing && !state.processing) throw new Error("processing cleared");
        if (prev.error !== state.error) throw new Error("error shown");
        throw new Error("other write");
      });

      expect(() => first.respond(200, GOOD_BODY)).toThrow("entry completed");
      await act(async () => {});

      await waitFor(() => expect(unhandled.rejections).toHaveLength(1));
      // Failing the entry in the catch is the root cause; the teardown's
      // throws came after it and must not replace it.
      expect(unhandled.rejections[0]).toMatchObject({ message: "entry failed" });
      expect(entry(0).status).toBe("failed");
      expect(entry(0).error).toBe(en.errors.jobTrackingFailed);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(en.errors.jobTrackingFailed);
      elapsed.expectCleared();
      expect(FakeXhr.instances).toHaveLength(1);
      for (const message of ["processing cleared", "error shown"]) {
        expect(consoleError).toHaveBeenCalledWith(
          "Ending an Erase Object batch failed",
          expect.objectContaining({ message }),
        );
      }
      // Two teardown writes threw; the first one is the one reported.
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
      const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
      expect(error.message).toBe("Ending an Erase Object batch after a store error failed");
      expect(error.cause).toMatchObject({ message: "processing cleared" });
      expect(tags).toEqual({ error_class: "bug", tool_id: "erase-object" });
    } finally {
      unsubscribe();
      elapsed.restore();
      unhandled.restore();
      consoleError.mockRestore();
    }
  });

  it("runs the rest of the teardown when stopping the counter throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = takeOverUnhandledRejections();
    const elapsed = watchElapsedInterval();
    const clearBroke = new Error("clear broke");
    elapsed.clearSpy.mockImplementation((handle) => {
      if (handle !== undefined && handle === elapsed.handles[0]) throw clearBroke;
      elapsed.realClearInterval(handle);
    });
    try {
      renderPanel(2);
      const first = await submit(1);
      // A 422 lands nothing, so the next entry write is the catch's failed
      // write. It throws before it lands; every write after it works.
      vi.spyOn(useFileStore.getState(), "updateEntry")
        .mockImplementationOnce(() => {
          throw new Error("fail write broke");
        })
        .mockImplementation(realUpdateEntry);

      first.respond(422, { error: "Object erasing failed" });

      await waitFor(() => expect(unhandled.rejections).toHaveLength(1));
      expect(unhandled.rejections[0]).toMatchObject({ message: "fail write broke" });
      // Every step after the throwing one still ran: the run ended, the
      // error shows, and the file the batch left behind was settled.
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(en.errors.jobTrackingFailed);
      expect(entry(0).status).toBe("failed");
      expect(entry(0).error).toBe(en.errors.jobTrackingFailed);
      expect(FakeXhr.instances).toHaveLength(1);
      expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(captureHandledError).mock.calls[0][0].cause).toBe(clearBroke);
    } finally {
      elapsed.restore();
      unhandled.restore();
      consoleError.mockRestore();
    }
  });

  it("rethrows a teardown throw, unreported, when every file went through", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = takeOverUnhandledRejections();
    let unsubscribe = () => {};
    try {
      renderPanel(2);
      (await submit(1)).respond(200, GOOD_BODY);
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      // Only ending the run breaks: the write that clears processing throws.
      unsubscribe = useFileStore.subscribe((state, prev) => {
        if (prev.processing && !state.processing) throw new Error("teardown broke");
      });

      FakeXhr.instances[1].respond(200, GOOD_BODY);

      await waitFor(() => expect(unhandled.rejections).toHaveLength(1));
      expect(unhandled.rejections[0]).toMatchObject({ message: "teardown broke" });
      expect(entry(0).status).toBe("completed");
      expect(entry(1).status).toBe("completed");
      expect(useFileStore.getState().processing).toBe(false);
      // A batch that went through shows no error.
      expect(useFileStore.getState().error).toBeNull();
      expect(screen.getByTestId("erase-object-submit")).toBeEnabled();
      // Sentry's global handler gets the rethrow, so no second report.
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      unhandled.restore();
      consoleError.mockRestore();
    }
  });

  it("ends the batch when marking the next file as processing throws", async () => {
    const unhandled = takeOverUnhandledRejections();
    const elapsed = watchElapsedInterval();
    try {
      renderPanel(2);
      const first = await submit(1);
      // The first file lands; the next entry write, marking file two as
      // processing, throws before it lands.
      vi.spyOn(useFileStore.getState(), "updateEntry")
        .mockImplementationOnce(realUpdateEntry)
        .mockImplementationOnce(() => {
          throw new Error("marking broke");
        })
        .mockImplementation(realUpdateEntry);

      first.respond(200, GOOD_BODY);

      await waitFor(() => expect(unhandled.rejections).toHaveLength(1));
      expect(unhandled.rejections[0]).toMatchObject({ message: "marking broke" });
      expect(entry(0).status).toBe("completed");
      expect(entry(1).status).not.toBe("processing");
      expect(FakeXhr.instances).toHaveLength(1);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(en.errors.jobTrackingFailed);
      elapsed.expectCleared();
      expect(screen.getByTestId("erase-object-submit")).toBeEnabled();
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      elapsed.restore();
      unhandled.restore();
    }
  });

  it("settles a file marked processing that the stopped batch never sent", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = takeOverUnhandledRejections();
    let unsubscribe = () => {};
    try {
      renderPanel(2);
      const first = await submit(1);
      // Marking file two as processing lands, then its listener throws.
      unsubscribe = useFileStore.subscribe((state, prev) => {
        if (prev.entries[1]?.status !== "processing" && state.entries[1]?.status === "processing") {
          throw new Error("marking listener broke");
        }
      });

      first.respond(200, GOOD_BODY);

      await waitFor(() => expect(unhandled.rejections).toHaveLength(1));
      expect(unhandled.rejections[0]).toMatchObject({ message: "marking listener broke" });
      expect(FakeXhr.instances).toHaveLength(1);
      expect(entry(0).status).toBe("completed");
      expect(entry(1).status).toBe("failed");
      expect(entry(1).error).toBe(en.errors.jobTrackingFailed);
      expect(useFileStore.getState().processing).toBe(false);
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      unhandled.restore();
      consoleError.mockRestore();
    }
  });

  it("ends the batch when starting it throws", async () => {
    const unhandled = takeOverUnhandledRejections();
    let unsubscribe = () => {};
    try {
      renderPanel(2);
      // setProcessing(true) lands, then a listener throws: nothing may be left
      // at processing with no request ever sent.
      unsubscribe = useFileStore.subscribe((state, prev) => {
        if (!prev.processing && state.processing) throw new Error("start broke");
      });

      fireEvent.click(screen.getByTestId("erase-object-submit"));

      await waitFor(() => expect(unhandled.rejections).toHaveLength(1));
      expect(unhandled.rejections[0]).toMatchObject({ message: "start broke" });
      expect(FakeXhr.instances).toHaveLength(0);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(en.errors.jobTrackingFailed);
      expect(entry(0).status).not.toBe("processing");
      expect(screen.getByTestId("erase-object-submit")).toBeEnabled();
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      unhandled.restore();
    }
  });
});
