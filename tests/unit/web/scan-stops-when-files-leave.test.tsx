// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { FeatureBundleState } from "@snapotter/shared";
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

  constructor() {
    FakeXhr.instances.push(this);
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  open() {}
  setRequestHeader() {}
  send() {}

  respond(status: number, body: unknown) {
    act(() => {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    });
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

interface Panel {
  name: string;
  render: () => ReturnType<typeof render>;
  submitTestId: string;
  goodBody: unknown;
  stopMessage: string;
  toolId: string;
}

const panels: Panel[] = [
  {
    name: "barcode reader",
    render: () => render(<BarcodeReadSettings />),
    submitTestId: "barcode-read-submit",
    goodBody: { filename: "one.png", barcodes: [], annotatedUrl: "/api/v1/download/j/a.png" },
    stopMessage: "Stopping a barcode scan whose files left failed",
    toolId: "barcode-read",
  },
  {
    name: "OCR",
    render: () => render(<OcrSettings />),
    submitTestId: "ocr-submit",
    goodBody: { text: "hello" },
    stopMessage: "Stopping an OCR scan whose files left failed",
    toolId: "ocr",
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
  });

  it("keeps going when more files are added mid-scan", async () => {
    panel.render();
    const first = await submit(panel);

    act(() => useFileStore.getState().addFiles([image("four.png")]));
    first.respond(200, panel.goodBody);
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));

    expect(first.aborted).toBe(false);
  });

  it("reports a throw while stopping instead of breaking the reset that caused it", async () => {
    panel.render();
    const first = await submit(panel);
    vi.spyOn(first, "abort").mockImplementation(() => {
      throw new Error("abort blew up");
    });

    expect(() => moveToAnotherTool()).not.toThrow();
    await act(async () => {});

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

    moveToAnotherTool();
    await act(async () => {});

    expect(FakeEventSource.instances[0].readyState).toBe(2);
    expect(FakeXhr.instances).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(false);
  });
});
