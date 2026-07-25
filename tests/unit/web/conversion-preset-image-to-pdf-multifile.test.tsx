// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Map<string, string>(),
  parseApiError: () => "error",
}));

let mockToolId = "jpg-to-pdf";
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: () => ({ toolId: mockToolId }) };
});

import { ConversionPresetSettings } from "@/components/tools/conversion-preset-settings";
import { useFileStore } from "@/stores/file-store";

interface MockXhr {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  upload: Record<string, unknown>;
  status: number;
  responseText: string;
  timeout: number;
}

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) {}
}

function makeFile(name: string, type = "image/jpeg"): File {
  return new File([new ArrayBuffer(64)], name, { type });
}

let xhrInstances: MockXhr[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
  useFileStore.getState().reset();
  xhrInstances = [];

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
      xhrInstances.push(xhr);
      return xhr;
    }),
  );

  // Never resolves; these tests only assert the call was (or wasn't) made.
  fetchMock = vi.fn(() => new Promise(() => {}));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Issue #627: the jpg-to-pdf preset (and its image-to-pdf-group siblings)
 * combine every uploaded file into one PDF, the same as the base image-to-pdf
 * tool. Submitting 2+ files must stay on the single "attach all files" route,
 * never the generic per-file /batch endpoint (which 404s for these tools:
 * they are registered via registerImageToPdfRoute, not createToolRoute, so
 * they were never added to the batch-capable tool registry).
 */
describe("ConversionPresetSettings multi-file dispatch (issue #627)", () => {
  it("combines 2 files for jpg-to-pdf in one request instead of calling /batch", () => {
    mockToolId = "jpg-to-pdf";
    useFileStore.getState().setFiles([makeFile("a.jpg"), makeFile("b.jpg")]);

    render(<ConversionPresetSettings />);
    fireEvent.click(screen.getByTestId("preset-submit"));

    expect(xhrInstances).toHaveLength(1);
    expect(xhrInstances[0].open).toHaveBeenCalledWith("POST", "/api/v1/tools/image/jpg-to-pdf");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("combines 2 files for every image-to-pdf-group preset, not just jpg-to-pdf", () => {
    mockToolId = "png-to-pdf";
    useFileStore
      .getState()
      .setFiles([makeFile("a.png", "image/png"), makeFile("b.png", "image/png")]);

    render(<ConversionPresetSettings />);
    fireEvent.click(screen.getByTestId("preset-submit"));

    expect(xhrInstances).toHaveLength(1);
    expect(xhrInstances[0].open).toHaveBeenCalledWith("POST", "/api/v1/tools/image/png-to-pdf");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still uses independent per-file batch processing for ordinary presets like jpg-to-png", () => {
    mockToolId = "jpg-to-png";
    useFileStore.getState().setFiles([makeFile("a.jpg"), makeFile("b.jpg")]);

    render(<ConversionPresetSettings />);
    fireEvent.click(screen.getByTestId("preset-submit"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/tools/image/jpg-to-png/batch");
    expect(xhrInstances).toHaveLength(0);
  });

  it("uses the single-file request for jpg-to-pdf when only 1 file is selected", () => {
    mockToolId = "jpg-to-pdf";
    useFileStore.getState().setFiles([makeFile("a.jpg")]);

    render(<ConversionPresetSettings />);
    fireEvent.click(screen.getByTestId("preset-submit"));

    expect(xhrInstances).toHaveLength(1);
    expect(xhrInstances[0].open).toHaveBeenCalledWith("POST", "/api/v1/tools/image/jpg-to-pdf");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
