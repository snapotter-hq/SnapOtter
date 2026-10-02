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
    shownResult: () => screen.queryByText(en.toolSettings["barcode-read"].noBarcodesFound),
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
});
