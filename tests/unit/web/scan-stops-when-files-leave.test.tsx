// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en, type FeatureBundleState } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));

import { BarcodeReadSettings } from "@/components/tools/barcode-read-settings";
import { OcrSettings } from "@/components/tools/ocr-settings";
import { captureHandledError } from "@/lib/analytics";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";

/**
 * Barcode-read and OCR scan their files one request at a time from the panel.
 * Leaving for another tool (which resets the file store) or opening library
 * files (which replace it) has to stop that loop: the request in flight is
 * dropped and no more files go out (#1932). A bare unmount must not, because
 * the panel also unmounts whenever the mobile settings sheet closes (#1974).
 */

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readyState = 1;
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
  onabort: (() => void) | null = null;
  upload: { onprogress: unknown } = { onprogress: null };
  aborted = false;
  done = false;

  constructor() {
    FakeXhr.instances.push(this);
  }

  // As in a browser: aborting a request that already answered fires nothing.
  abort() {
    this.aborted = true;
    if (!this.done) this.onabort?.();
  }

  open() {}
  setRequestHeader() {}
  send() {}

  /** Answer without wrapping in act, for a caller already inside one. */
  answer(status: number, body: unknown) {
    this.done = true;
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }

  respond(status: number, body: unknown) {
    act(() => this.answer(status, body));
  }
}

function ocrBundle(): FeatureBundleState {
  return {
    id: "ocr",
    name: "OCR",
    description: "Accurate local OCR",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "300 MB",
    downloadBytes: 1,
    missingDownloadBytes: 1,
    compatibility: "compatible",
    compatibilityReason: "descriptor-missing",
    selectedTarget: "linux-amd64-cpu-py312",
    healthyGeneration: null,
    availableQualities: ["fast"],
    enablesTools: ["ocr", "ocr-pdf"],
    progress: null,
    error: null,
  };
}

const ANNOTATED_URL = "/api/v1/download/j/a.png";

interface Panel {
  name: string;
  render: () => ReturnType<typeof render>;
  submitTestId: string;
  goodBody: unknown;
  stopMessage: string;
  toolId: string;
  /** Whatever the panel shows once a scan has ended with results. */
  shownResult: () => HTMLElement | null;
  /** Barcode-read writes its annotated image onto the file's entry; OCR doesn't. */
  writesEntries: boolean;
}

const panels: Panel[] = [
  {
    name: "barcode reader",
    render: () => render(<BarcodeReadSettings />),
    submitTestId: "barcode-read-submit",
    goodBody: { filename: "one.png", barcodes: [], annotatedUrl: ANNOTATED_URL },
    stopMessage: "Stopping a barcode scan whose files left failed",
    toolId: "barcode-read",
    shownResult: () =>
      screen.queryAllByText(en.toolSettings["barcode-read"].noBarcodesFound)[0] ?? null,
    writesEntries: true,
  },
  {
    name: "OCR",
    render: () => render(<OcrSettings />),
    submitTestId: "ocr-submit",
    goodBody: { text: "hello" },
    stopMessage: "Stopping an OCR scan whose files left failed",
    toolId: "ocr",
    shownResult: () => screen.queryByTestId("ocr-result-text"),
    writesEntries: false,
  },
];

function image(name: string): File {
  return new File(["png"], name, { type: "image/png" });
}

function entry(index = 0) {
  return useFileStore.getState().entries[index];
}

async function submit(panel: Panel): Promise<FakeXhr> {
  fireEvent.click(screen.getByTestId(panel.submitTestId));
  await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
  return FakeXhr.instances[0];
}

/** What the tool page does on the way out: a fresh store for the next tool. */
function moveToAnotherTool() {
  act(() => {
    useFileStore.getState().reset();
    useFileStore.getState().setFiles([image("next-tool.png")]);
  });
}

let blobCount = 0;

beforeEach(() => {
  blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  FakeXhr.instances = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.mocked(captureHandledError).mockClear();
  useFeaturesStore.setState({ bundles: [ocrBundle()], loaded: true, loadError: false });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([image("one.png"), image("two.png"), image("three.png")]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useFileStore.getState().reset();
});

describe.each(panels)("$name: the scan stops once its files leave the store (#1932)", (panel) => {
  it("leaving for another tool drops the file in flight and sends no more", async () => {
    const { unmount } = panel.render();
    const first = await submit(panel);

    unmount();
    moveToAnotherTool();

    expect(first.aborted).toBe(true);
    // Answered anyway: it lands nowhere, and no second file goes out.
    first.respond(200, panel.goodBody);
    await act(async () => {});
    expect(FakeXhr.instances).toHaveLength(1);
    expect(entry(0).file.name).toBe("next-tool.png");
    expect(entry(0).status).toBe("pending");
    expect(entry(0).processedUrl).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
  });

  it("stops at the file in flight when the files go after one has finished", async () => {
    panel.render();
    const first = await submit(panel);
    first.respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    const second = FakeXhr.instances[1];

    moveToAnotherTool();
    await act(async () => {});

    expect(second.aborted).toBe(true);
    expect(FakeXhr.instances).toHaveLength(2);
    expect(entry(0).status).toBe("pending");
    expect(entry(0).processedUrl).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
    // The first file's result belonged to files that are gone: none shown.
    expect(panel.shownResult()).toBeNull();
  });

  it("sends nothing more when the files go just as a file finishes", async () => {
    panel.render();
    const first = await submit(panel);

    // Same tick: the file has resolved, so only the loop's own check stops it.
    act(() => {
      first.answer(200, panel.goodBody);
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next-tool.png")]);
    });
    await act(async () => {});

    expect(FakeXhr.instances).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(false);
    expect(entry(0).status).toBe("pending");
    expect(panel.shownResult()).toBeNull();
  });

  it("ends the run when library files replace the scan's without a reset", async () => {
    panel.render();
    const first = await submit(panel);
    expect(useFileStore.getState().processing).toBe(true);

    act(() => useFileStore.getState().setFiles([image("from-library.png")]));
    await act(async () => {});

    expect(first.aborted).toBe(true);
    expect(FakeXhr.instances).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
    expect(entry(0).status).toBe("pending");
  });

  it("keeps going when only the panel unmounts, as the mobile settings sheet does", async () => {
    const { unmount } = panel.render();
    const first = await submit(panel);

    unmount();
    first.respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(3));
    FakeXhr.instances[2].respond(200, panel.goodBody);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(first.aborted).toBe(false);
    if (panel.writesEntries) {
      for (const i of [0, 1, 2]) {
        expect(entry(i).status).toBe("completed");
        expect(entry(i).processedUrl).toBe(ANNOTATED_URL);
      }
    }
  });

  it("keeps going when more files are added mid-scan, and scans only its own", async () => {
    panel.render();
    const first = await submit(panel);

    act(() => useFileStore.getState().addFiles([image("four.png")]));
    first.respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(3));
    FakeXhr.instances[2].respond(200, panel.goodBody);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(first.aborted).toBe(false);
    expect(FakeXhr.instances).toHaveLength(3);
    if (panel.writesEntries) expect(entry(2).status).toBe("completed");
    expect(entry(3).status).toBe("pending");
  });

  it("reports a throw while stopping instead of breaking the reset that caused it", async () => {
    panel.render();
    const first = await submit(panel);
    vi.spyOn(first, "abort").mockImplementation(() => {
      throw new Error("abort blew up");
    });

    expect(() => moveToAnotherTool()).not.toThrow();
    await act(async () => {});

    // OCR settles the file before it aborts, so its stream is closed already.
    for (const es of FakeEventSource.instances) expect(es.readyState).toBe(2);
    expect(entry(0).file.name).toBe("next-tool.png");
    expect(FakeXhr.instances).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error.message).toBe(panel.stopMessage);
    expect(tags).toEqual({ error_class: "bug", tool_id: panel.toolId });

    // The abort never happened, so the answer still arrives: it lands nowhere.
    first.respond(200, panel.goodBody);
    await act(async () => {});
    expect(entry(0).status).toBe("pending");
    expect(entry(0).processedUrl).toBeNull();
  });

  it("stops the scan and clears processing when the tool route leaves without resetting the store (#1994)", async () => {
    const { unmount } = panel.render();
    const first = await submit(panel);
    expect(useFileStore.getState().processing).toBe(true);

    unmount();
    act(() => {
      useFileStore.getState().stopRuns();
    });

    expect(first.aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    first.respond(200, panel.goodBody);
    await act(async () => {});
    expect(FakeXhr.instances).toHaveLength(1);
    expect(entry(0).status).toBe("pending");
    expect(entry(0).processedUrl).toBeNull();
    expect(useFileStore.getState().error).toBeNull();
  });

  it("still clears processing and reports the first error when abort throws during stopRuns (#1994)", async () => {
    const { unmount } = panel.render();
    const first = await submit(panel);
    const abortBoom = new Error("abort blew up on route leave");
    vi.spyOn(first, "abort").mockImplementation(() => {
      throw abortBoom;
    });

    unmount();
    expect(() =>
      act(() => {
        useFileStore.getState().stopRuns();
      }),
    ).not.toThrow();
    await act(async () => {});

    for (const es of FakeEventSource.instances) expect(es.readyState).toBe(2);
    expect(useFileStore.getState().processing).toBe(false);
    expect(FakeXhr.instances).toHaveLength(1);
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error.message).toBe(panel.stopMessage);
    expect(error.cause).toBe(abortBoom);
    expect(tags).toEqual({ error_class: "bug", tool_id: panel.toolId });
  });

  it("does not clobber a new run's processing flag when the stopped scan's microtask drains (#1994)", async () => {
    const { unmount } = panel.render();
    await submit(panel);

    unmount();
    act(() => {
      useFileStore.getState().stopRuns();
      useFileStore.getState().setProcessing(true);
    });
    await act(async () => {});

    expect(useFileStore.getState().processing).toBe(true);
  });

  it("skips a queued entry removed via removeFile mid-scan and finishes the remaining entries (#3465)", async () => {
    panel.render();
    const first = await submit(panel);

    act(() => {
      useFileStore.getState().removeFile(1);
    });
    expect(first.aborted).toBe(false);
    expect(useFileStore.getState().processing).toBe(true);

    first.respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(
      200,
      panel.writesEntries
        ? { ...(panel.goodBody as Record<string, unknown>), filename: "three.png" }
        : panel.goodBody,
    );
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(FakeXhr.instances).toHaveLength(2);
    expect(panel.shownResult()).not.toBeNull();
    if (panel.writesEntries) {
      expect(entry(0).status).toBe("completed");
      expect(entry(1).file.name).toBe("three.png");
      expect(entry(1).status).toBe("completed");
    }
  });

  it("aborts only the in-flight entry when removed via removeFile and continues to the remaining entries (#3465)", async () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png"), image("three.png")]);
    panel.render();
    const first = await submit(panel);

    act(() => {
      useFileStore.getState().removeFile(0);
    });
    expect(first.aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(true);

    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    const second = FakeXhr.instances[1];
    const abortBoom = new Error("abort blew up on partial removeFile");
    vi.spyOn(second, "abort").mockImplementationOnce(() => {
      throw abortBoom;
    });

    expect(() =>
      act(() => {
        useFileStore.getState().removeFile(0);
      }),
    ).not.toThrow();
    expect(useFileStore.getState().processing).toBe(true);
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [reportedErr, reportedTags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(reportedErr.message).toBe(panel.stopMessage);
    expect(reportedErr.cause).toBe(abortBoom);
    expect(reportedTags).toEqual({ error_class: "bug", tool_id: panel.toolId });

    await waitFor(() => expect(FakeXhr.instances).toHaveLength(3));
    FakeXhr.instances[2].respond(200, panel.goodBody);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(FakeXhr.instances).toHaveLength(3);
    expect(useFileStore.getState().error).toBeNull();
    expect(panel.shownResult()).not.toBeNull();
    expect(entry(0).file.name).toBe("three.png");
    expect(entry(0).status).toBe("completed");
    expect(entry(0).processedUrl).not.toBeNull();
  });

  it("aborts the last remaining in-flight entry when removed via removeFile after an earlier entry completed, clears processing, and preserves the completed entry's result (#3465)", async () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    panel.render();
    const first = await submit(panel);
    first.respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    const second = FakeXhr.instances[1];

    act(() => {
      useFileStore.getState().removeFile(1);
    });

    expect(second.aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBeNull();
    expect(panel.shownResult()).not.toBeNull();
    expect(entry(0).file.name).toBe("one.png");
    expect(entry(0).status).toBe("completed");
    expect(entry(0).processedUrl).not.toBeNull();

    // Starting a new scan on the remaining entry before the stopped scan's microtask drains is not clobbered.
    fireEvent.click(screen.getByTestId(panel.submitTestId));
    await act(async () => {});
    expect(useFileStore.getState().processing).toBe(true);
    expect(FakeXhr.instances).toHaveLength(3);
    FakeXhr.instances[2].respond(200, panel.goodBody);
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
  });

  it("counts errors against processedCount when entries are removed via removeFile mid-scan (#3465)", async () => {
    // 1. Removing entry 0 while in flight and failing entry 1 reports the single-entry error (errors.length === processedCount).
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    panel.render();
    await submit(panel);

    act(() => {
      useFileStore.getState().removeFile(0);
    });
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(500, { error: "Scan failed on two" });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(useFileStore.getState().error).toContain("two.png:");
    expect(useFileStore.getState().error).toContain("Scan failed on two");

    // 2. Removing entry 1 while queued, succeeding on entry 0, and failing on entry 2 formats filesFailed against processedCount (2, not 3).
    FakeXhr.instances = [];
    act(() => {
      useFileStore.getState().setFiles([image("one.png"), image("two.png"), image("three.png")]);
    });
    const run2First = await submit(panel);
    act(() => {
      useFileStore.getState().removeFile(1);
    });
    run2First.respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
    FakeXhr.instances[1].respond(500, { error: "Scan failed on three" });
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

    expect(useFileStore.getState().error).toContain("1");
    expect(useFileStore.getState().error).toContain("2");
    expect(useFileStore.getState().error).not.toContain("3");
  });
});

describe("OCR: a file the server took async stops too (#1932)", () => {
  it("closes the progress stream after a 202 when the files go", async () => {
    panels[1].render();
    const first = await submit(panels[1]);
    first.respond(202, { jobId: "j", async: true });
    expect(FakeEventSource.instances[0].readyState).toBe(1);

    // The library path: no reset clears processing for it, so the loop must.
    act(() => useFileStore.getState().setFiles([image("from-library.png")]));
    await act(async () => {});

    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(FakeXhr.instances).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("closes the progress stream after a 202 when stopRuns fires without resetting the store (#1994)", async () => {
    const { unmount } = panels[1].render();
    const first = await submit(panels[1]);
    first.respond(202, { jobId: "j", async: true });
    expect(FakeEventSource.instances[0].readyState).toBe(1);

    unmount();
    act(() => {
      useFileStore.getState().stopRuns();
    });
    await act(async () => {});

    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(FakeXhr.instances).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("does not record savedFileId when stopRuns fires in the same tick a single-file library OCR finishes (#1994)", async () => {
    useFileStore.getState().setFiles([image("one.png")]);
    useFileStore.getState().updateEntry(0, { serverFileId: "lib-source-1" });
    panels[1].render();
    const first = await submit(panels[1]);

    act(() => {
      first.answer(200, { text: "hello", savedFileId: "lib-saved-1" });
      useFileStore.getState().stopRuns();
    });
    await act(async () => {});

    expect(useFileStore.getState().lastSavedLibraryFileId).toBeNull();
    expect(useFileStore.getState().processing).toBe(false);
  });
});
