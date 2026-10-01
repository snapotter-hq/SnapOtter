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

function expectReported(message: string, statusCode: number) {
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
    // the root cause, then the teardown's store write throws again.
    let writes = 0;
    const unsubscribe = useFileStore.subscribe(() => {
      writes++;
      throw new Error(writes === 1 ? "root cause" : "teardown broke");
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
