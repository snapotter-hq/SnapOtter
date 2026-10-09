// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentType, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { FaviconSettings } from "@/components/tools/favicon-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { InfoSettings } from "@/components/tools/info-settings";
import { captureHandledError } from "@/lib/analytics";
import { useFileStore } from "@/stores/file-store";

/**
 * #2304: these panels run their request themselves and abort it when they
 * unmount. An abort fires neither onload nor onerror, so nothing cleared the file
 * store's `processing` flag: a panel that remounts (the window crossing the
 * breakpoint swaps the whole tool page) showed a run that could never end, and
 * with the page turning dropped files away mid-run (#2108) it would refuse them
 * all.
 */

class FakeXhr {
  static instances: FakeXhr[] = [];
  responseType = "";
  timeout = 0;
  status = 0;
  response: unknown = null;
  responseText = "";
  upload: { onprogress: unknown; onload: unknown } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  aborted = false;
  constructor() {
    FakeXhr.instances.push(this);
  }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() {
    this.aborted = true;
  }
}

const fetchSignals: AbortSignal[] = [];

function image() {
  return new File(["png"], "photo.png", { type: "image/png" });
}

const INTERRUPTED = en.errors.runInterrupted;

const INFO_DATA = {
  filename: "photo.png",
  fileSize: 3,
  width: 1,
  height: 1,
  format: "png",
  channels: 3,
  hasAlpha: false,
  colorSpace: "srgb",
  density: null,
  isProgressive: false,
  orientation: null,
  hasProfile: false,
  hasExif: false,
  hasIcc: false,
  hasXmp: false,
  bitDepth: null,
  pages: 1,
  histogram: [],
};

beforeEach(() => {
  vi.mocked(captureHandledError).mockClear();
  FakeXhr.instances = [];
  fetchSignals.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  // A request that never answers and rejects when aborted, as the real one does.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          fetchSignals.push(init.signal);
          init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ),
  );
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([image()]);
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
});

const xhrPanels: [string, ComponentType, string][] = [
  ["favicon", FaviconSettings, "favicon-submit"],
  ["image-to-pdf", ImageToPdfSettings, "image-to-pdf-submit"],
];

describe.each(xhrPanels)("%s panel (#2304)", (_name, Panel, submitId) => {
  it("clears processing and says the run was cut off when it unmounts mid-run", () => {
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByTestId(submitId));
    expect(useFileStore.getState().processing).toBe(true);

    unmount();

    expect(FakeXhr.instances[0].aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe(INTERRUPTED);
  });

  it("survives StrictMode's mount, unmount, mount and still settles a real unmount", () => {
    const { unmount } = render(
      <StrictMode>
        <Panel />
      </StrictMode>,
    );
    // The simulated unmount saw nothing in flight, so nothing was written.
    expect(useFileStore.getState().error).toBeNull();
    fireEvent.click(screen.getByTestId(submitId));
    expect(useFileStore.getState().processing).toBe(true);

    unmount();

    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe(INTERRUPTED);
  });

  it("does not throw out of the cleanup when a store subscriber does, and reports it", () => {
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByTestId(submitId));
    const realSetError = useFileStore.getState().setError;
    vi.spyOn(useFileStore.getState(), "setError").mockImplementation((message) => {
      if (message === INTERRUPTED) throw new Error("boom");
      realSetError(message);
    });

    try {
      expect(() => unmount()).not.toThrow();
    } finally {
      useFileStore.setState({ setError: realSetError });
    }

    expect(FakeXhr.instances[0].aborted).toBe(true);
    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
      "Ending a tool run after its panel unmounted failed",
    );
  });

  it("aborts but writes nothing into a store the user already cleared", () => {
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByTestId(submitId));
    act(() => {
      useFileStore.getState().reset();
    });

    unmount();

    expect(FakeXhr.instances[0].aborted).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
  });

  it("leaves the store alone when it unmounts with nothing running", () => {
    const { unmount } = render(<Panel />);

    unmount();

    expect(useFileStore.getState().error).toBeNull();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("leaves a finished run's outcome alone when it unmounts afterwards", () => {
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByTestId(submitId));
    act(() => {
      const xhr = FakeXhr.instances[0];
      xhr.status = 500;
      xhr.response = new Blob(["x"]);
      xhr.responseText = "{}";
      xhr.onload?.();
    });
    const errorAfterRun = useFileStore.getState().error;
    expect(errorAfterRun).not.toBeNull();
    expect(useFileStore.getState().processing).toBe(false);

    unmount();

    // Its own failure message stands; the unmount adds nothing and aborts nothing.
    expect(useFileStore.getState().error).toBe(errorAfterRun);
    expect(useFileStore.getState().error).not.toBe(INTERRUPTED);
  });
});

describe("info panel (#2304)", () => {
  it("clears processing and says the run was cut off when it unmounts mid-fetch", () => {
    const { unmount } = render(<InfoSettings />);
    fireEvent.click(screen.getByTestId("info-submit"));
    expect(useFileStore.getState().processing).toBe(true);

    unmount();

    expect(fetchSignals[0].aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe(INTERRUPTED);
  });

  it("leaves the store alone when it unmounts with nothing running", () => {
    const { unmount } = render(<InfoSettings />);

    unmount();

    expect(useFileStore.getState().error).toBeNull();
    expect(fetchSignals).toHaveLength(0);
  });

  it("leaves a finished read's result alone when it unmounts afterwards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => INFO_DATA })),
    );
    const { unmount } = render(<InfoSettings />);
    fireEvent.click(screen.getByTestId("info-submit"));
    await act(async () => {});
    expect(useFileStore.getState().processing).toBe(false);

    unmount();

    expect(useFileStore.getState().error).toBeNull();
  });

  it("does not report a superseded fetch as a cut-off run", async () => {
    // Two files: asking for the second aborts the first, which must not clear
    // processing early or leave a message; the second fetch is still running.
    useFileStore.getState().setFiles([image(), image()]);
    render(<InfoSettings />);
    fireEvent.click(screen.getByTestId("info-submit"));
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    await act(async () => {});

    expect(fetchSignals).toHaveLength(2);
    expect(fetchSignals[0].aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
  });
});
