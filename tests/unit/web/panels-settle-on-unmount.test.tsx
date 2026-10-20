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

import { BulkRenameSettings } from "@/components/tools/bulk-rename-settings";
import { CollageSettings } from "@/components/tools/collage-settings";
import { ColorPaletteSettings } from "@/components/tools/color-palette-settings";
import { CompareSettings } from "@/components/tools/compare-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
import { FaviconSettings } from "@/components/tools/favicon-settings";
import { ImageToBase64Settings } from "@/components/tools/image-to-base64-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { InfoSettings } from "@/components/tools/info-settings";
import { PassportPhotoSettings } from "@/components/tools/passport-photo-settings";
import { SplitSettings } from "@/components/tools/split-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
import { captureHandledError } from "@/lib/analytics";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { useMemeStore } from "@/stores/meme-store";
import { type AnalyzeResult, usePassportPhotoStore } from "@/stores/passport-photo-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useSplitStore } from "@/stores/split-store";

/**
 * #2304 & #2636: panels that run their request themselves abort it when they
 * unmount. An abort fires neither onload nor onerror, so nothing cleared the file
 * store's `processing` flag: a panel that remounts (the window crossing the
 * breakpoint swaps the whole tool page) showed a run that could never end, and
 * with the page turning dropped files away mid-run (#2108) it would refuse them
 * all. Own-store tool handlers abort and ignore late completions when their
 * store resets.
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

interface PendingFetch {
  url: string;
  signal?: AbortSignal;
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
}

const fetchSignals: Array<AbortSignal | undefined> = [];
const pendingFetches: PendingFetch[] = [];

function image(name = "photo.png") {
  return new File(["png"], name, { type: "image/png" });
}

function chooseSecondaryFile(container: HTMLElement, file = image("second.png")) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("Expected secondary file input");
  fireEvent.change(input, { target: { files: [file] } });
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

const PASSPORT_ANALYZE_RESULT: AnalyzeResult = {
  preview:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  landmarks: {
    leftEye: { x: 0.42, y: 0.4 },
    rightEye: { x: 0.58, y: 0.4 },
    eyeCenter: { x: 0.5, y: 0.4 },
    chin: { x: 0.5, y: 0.62 },
    forehead: { x: 0.5, y: 0.25 },
    crown: { x: 0.5, y: 0.18 },
    nose: { x: 0.5, y: 0.5 },
    faceCenterX: 0.5,
  },
  imageWidth: 900,
  imageHeight: 1200,
  jobId: "passport-job-1",
  filename: "photo.png",
};

beforeEach(() => {
  vi.mocked(captureHandledError).mockClear();
  FakeXhr.instances = [];
  fetchSignals.length = 0;
  pendingFetches.length = 0;
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  // A request that never answers on its own and rejects when aborted, as the real one does.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init?.signal ?? undefined;
          fetchSignals.push(signal);
          pendingFetches.push({ url: String(input), signal, resolve, reject });
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ),
  );
  useFileStore.getState().reset();
  useSplitStore.getState().reset();
  useBase64Store.getState().reset();
  useCollageStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  useHtmlToImageStore.getState().reset();
  usePdfToImageStore.getState().reset();
  useMemeStore.getState().reset();
  useFileStore.getState().setFiles([image()]);
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  useSplitStore.getState().reset();
  useBase64Store.getState().reset();
  useCollageStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  useHtmlToImageStore.getState().reset();
  usePdfToImageStore.getState().reset();
  useMemeStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const xhrPanels: [string, ComponentType, string, number][] = [
  ["favicon", FaviconSettings, "favicon-submit", 1],
  ["image-to-pdf", ImageToPdfSettings, "image-to-pdf-submit", 1],
  ["stitch", StitchSettings, "stitch-submit", 2],
];

describe.each(xhrPanels)("%s panel (#2304, #2636)", (_name, Panel, submitId, fileCount) => {
  beforeEach(() => {
    if (fileCount > 1) {
      useFileStore
        .getState()
        .setFiles(Array.from({ length: fileCount }, (_, i) => image(`photo-${i + 1}.png`)));
    }
  });

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
    vi.spyOn(useFileStore.getState(), "setError").mockImplementation((message: string | null) => {
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

  it("leaves a finished run's outcome alone when it unmounts afterwards", async () => {
    const { unmount } = render(<Panel />);
    fireEvent.click(screen.getByTestId(submitId));
    await act(async () => {
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

describe("favicon panel async error body read after unmount (#2516)", () => {
  it("ignores a non-2xx blob body that finishes reading after the panel unmounted", async () => {
    const { unmount } = render(<FaviconSettings />);
    fireEvent.click(screen.getByTestId("favicon-submit"));
    const xhr = FakeXhr.instances[0];

    act(() => {
      xhr.status = 500;
      xhr.response = new Blob([JSON.stringify({ error: "Stale server error" })]);
      xhr.onload?.();
    });
    // Unmount before the async Blob.text() promise resolves, then start a new run.
    unmount();
    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next.png")]);
      useFileStore.getState().setProcessing(true);
    });

    await act(async () => {});

    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
  });
});

describe("stitch panel late XHR after reset (#2636)", () => {
  it("ignores a late 200, 500, or network error response after useFileStore was reset and another run started", () => {
    for (const outcome of ["200", "500", "error"] as const) {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
      const { unmount } = render(<StitchSettings />);
      fireEvent.click(screen.getByTestId("stitch-submit"));
      const xhr = FakeXhr.instances[0];

      act(() => {
        useFileStore.getState().reset();
        useFileStore.getState().setFiles([image("pipeline.png")]);
        useFileStore.getState().setProcessing(true);
      });
      unmount();

      act(() => {
        if (outcome === "200") {
          xhr.status = 200;
          xhr.responseText = JSON.stringify({
            jobId: "job-1",
            downloadUrl: "/api/v1/download/job-1/stitched.png",
            originalSize: 100,
            processedSize: 80,
          });
          xhr.onload?.();
        } else if (outcome === "500") {
          xhr.status = 500;
          xhr.responseText = JSON.stringify({ error: "Server error" });
          xhr.onload?.();
        } else {
          xhr.onerror?.();
        }
      });

      expect(useFileStore.getState().processing).toBe(true);
      expect(useFileStore.getState().processedUrl).toBeNull();
      expect(useFileStore.getState().error).toBeNull();
    }
  });
});

describe("favicon and image-to-pdf panel late XHR after reset (#3071)", () => {
  it("favicon: aborts in-flight XHR, clears busy state, and ignores late 200, 500, error, or timeout when useFileStore resets while mounted", async () => {
    for (const outcome of ["200", "500", "error", "timeout"] as const) {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("one.png")]);
      const { unmount } = render(<FaviconSettings />);
      fireEvent.click(screen.getByTestId("favicon-submit"));
      const xhr = FakeXhr.instances[0];
      expect(screen.queryByTestId("favicon-submit")).toBeNull();

      act(() => {
        useFileStore.getState().reset();
        useFileStore.getState().setFiles([image("next.png")]);
        useFileStore.getState().setProcessing(true);
      });

      expect(xhr.aborted).toBe(true);
      expect(screen.getByTestId("favicon-submit")).toBeInTheDocument();

      await act(async () => {
        if (outcome === "200") {
          xhr.status = 200;
          xhr.response = new Blob(["zip"]);
          xhr.onload?.();
        } else if (outcome === "500") {
          xhr.status = 500;
          xhr.response = new Blob([JSON.stringify({ error: "Server error" })]);
          xhr.onload?.();
        } else if (outcome === "error") {
          xhr.onerror?.();
        } else {
          xhr.ontimeout?.();
        }
      });

      expect(useFileStore.getState().processing).toBe(true);
      expect(useFileStore.getState().processedUrl).toBeNull();
      expect(useFileStore.getState().error).toBeNull();
      expect(screen.queryByTestId("favicon-download")).toBeNull();
      unmount();
    }
  });

  it("favicon: ignores a non-2xx blob body when useFileStore resets while Blob.text() is pending", async () => {
    render(<FaviconSettings />);
    fireEvent.click(screen.getByTestId("favicon-submit"));
    const xhr = FakeXhr.instances[0];

    act(() => {
      xhr.status = 500;
      xhr.response = new Blob([JSON.stringify({ error: "Stale server error" })]);
      xhr.onload?.();
    });
    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("next.png")]);
      useFileStore.getState().setProcessing(true);
    });

    await act(async () => {});

    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
    expect(screen.getByTestId("favicon-submit")).toBeInTheDocument();
  });

  it("image-to-pdf: aborts in-flight XHR, clears busy state, and ignores late 200, 500, error, or timeout when useFileStore resets while mounted", () => {
    for (const outcome of ["200", "500", "error", "timeout"] as const) {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("one.png")]);
      const { unmount } = render(<ImageToPdfSettings />);
      fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
      const xhr = FakeXhr.instances[0];
      expect(screen.queryByTestId("image-to-pdf-submit")).toBeNull();

      act(() => {
        useFileStore.getState().reset();
        useFileStore.getState().setFiles([image("next.png")]);
        useFileStore.getState().setProcessing(true);
      });

      expect(xhr.aborted).toBe(true);
      expect(screen.getByTestId("image-to-pdf-submit")).toBeInTheDocument();

      act(() => {
        if (outcome === "200") {
          xhr.status = 200;
          xhr.responseText = JSON.stringify({
            downloadUrl: "/api/v1/download/job-1/document.pdf",
            compression: { targetMet: true, jpegQuality: 85, targetRequested: 100 },
          });
          xhr.onload?.();
        } else if (outcome === "500") {
          xhr.status = 500;
          xhr.responseText = JSON.stringify({ error: "Server error" });
          xhr.onload?.();
        } else if (outcome === "error") {
          xhr.onerror?.();
        } else {
          xhr.ontimeout?.();
        }
      });

      expect(useFileStore.getState().processing).toBe(true);
      expect(useFileStore.getState().processedUrl).toBeNull();
      expect(useFileStore.getState().error).toBeNull();
      expect(screen.queryByTestId("image-to-pdf-download")).toBeNull();
      expect(screen.queryByTestId("image-to-pdf-compression-result")).toBeNull();
      unmount();
    }
  });

  it("clears processing and aborts when the last file is removed via removeFile mid-run or xhr.send throws synchronously", () => {
    for (const [Panel, submitId] of [
      [FaviconSettings, "favicon-submit"],
      [ImageToPdfSettings, "image-to-pdf-submit"],
    ] as const) {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("only.png")]);
      const { unmount } = render(<Panel />);
      fireEvent.click(screen.getByTestId(submitId));
      const xhr = FakeXhr.instances[0];
      expect(useFileStore.getState().processing).toBe(true);

      act(() => {
        useFileStore.getState().removeFile(0);
      });

      expect(xhr.aborted).toBe(true);
      expect(useFileStore.getState().processing).toBe(false);
      expect(screen.getByTestId(submitId)).toBeDisabled();

      // Synchronous throw from xhr.send clears processing and busy and records the error.
      act(() => {
        useFileStore.getState().setFiles([image("retry.png")]);
      });
      vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
        throw new Error("send boom");
      });
      fireEvent.click(screen.getByTestId(submitId));
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe("send boom");
      expect(screen.getByTestId(submitId)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("info panel (#2304)", () => {
  it("clears processing and says the run was cut off when it unmounts mid-fetch", () => {
    const { unmount } = render(<InfoSettings />);
    fireEvent.click(screen.getByTestId("info-submit"));
    expect(useFileStore.getState().processing).toBe(true);

    unmount();

    expect(fetchSignals[0]?.aborted).toBe(true);
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
    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().error).toBeNull();
  });
});

interface FetchFileStorePanelCase {
  name: string;
  Panel: ComponentType;
  submitId: string;
  needsSecondaryFile: boolean;
  goodResponse: () => Response;
}

const fetchFileStorePanels: FetchFileStorePanelCase[] = [
  {
    name: "compare",
    Panel: CompareSettings,
    submitId: "compare-submit",
    needsSecondaryFile: true,
    goodResponse: () =>
      new Response(
        JSON.stringify({ similarity: 98.5, downloadUrl: "/api/v1/download/j/diff.png" }),
        { status: 200 },
      ),
  },
  {
    name: "color-palette",
    Panel: ColorPaletteSettings,
    submitId: "color-palette-submit",
    needsSecondaryFile: false,
    goodResponse: () =>
      new Response(JSON.stringify({ colors: ["#112233"], hex: ["#112233"] }), { status: 200 }),
  },
  {
    name: "watermark-image (single file)",
    Panel: WatermarkImageSettings,
    submitId: "watermark-image-submit",
    needsSecondaryFile: true,
    goodResponse: () =>
      new Response(
        JSON.stringify({
          jobId: "j-wm",
          downloadUrl: "/api/v1/download/j-wm/out.png",
          originalSize: 100,
          processedSize: 90,
        }),
        { status: 200 },
      ),
  },
  {
    name: "compose",
    Panel: ComposeSettings,
    submitId: "compose-submit",
    needsSecondaryFile: true,
    goodResponse: () =>
      new Response(
        JSON.stringify({
          jobId: "j-comp",
          downloadUrl: "/api/v1/download/j-comp/out.png",
          originalSize: 100,
          processedSize: 90,
        }),
        { status: 200 },
      ),
  },
  {
    name: "bulk-rename",
    Panel: BulkRenameSettings,
    submitId: "bulk-rename-submit",
    needsSecondaryFile: false,
    goodResponse: () => new Response("zip", { status: 200 }),
  },
];

describe.each(fetchFileStorePanels)(
  "$name panel (#2636)",
  ({ Panel, submitId, needsSecondaryFile, goodResponse }) => {
    it("aborts in-flight fetch, clears processing, and sets runInterrupted on unmount", async () => {
      const { container, unmount } = render(<Panel />);
      if (needsSecondaryFile) chooseSecondaryFile(container);
      fireEvent.click(screen.getByTestId(submitId));
      expect(useFileStore.getState().processing).toBe(true);
      expect(fetchSignals).toHaveLength(1);
      expect(fetchSignals[0]).toBeInstanceOf(AbortSignal);

      unmount();
      await act(async () => {});

      expect(fetchSignals[0]?.aborted).toBe(true);
      expect(useFileStore.getState().processing).toBe(false);
      expect(useFileStore.getState().error).toBe(INTERRUPTED);
    });

    it("leaves the store alone when it unmounts with nothing running", () => {
      const { unmount } = render(<Panel />);

      unmount();

      expect(useFileStore.getState().error).toBeNull();
      expect(fetchSignals).toHaveLength(0);
    });

    it("leaves a finished run's outcome alone when it unmounts afterwards", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => goodResponse()),
      );
      const anchorClickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      const { container, unmount } = render(<Panel />);
      if (needsSecondaryFile) chooseSecondaryFile(container);
      fireEvent.click(screen.getByTestId(submitId));
      await act(async () => {});
      expect(useFileStore.getState().processing).toBe(false);

      unmount();

      expect(useFileStore.getState().error).toBeNull();
      anchorClickSpy.mockRestore();
    });

    it("does not clobber a reset store or trigger downloads when an orphaned request resolves late", async () => {
      let resolveFetch: (res: Response) => void = () => {};
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((resolve) => {
              fetchSignals.push(init?.signal ?? undefined);
              resolveFetch = resolve;
            }),
        ),
      );
      const anchorClickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      const { container, unmount } = render(<Panel />);
      if (needsSecondaryFile) chooseSecondaryFile(container);
      fireEvent.click(screen.getByTestId(submitId));
      expect(useFileStore.getState().processing).toBe(true);

      // Simulate navigating away: panel unmounts, store resets, and a new run starts on /automate.
      unmount();
      act(() => {
        useFileStore.getState().reset();
        useFileStore.getState().setFiles([image("next.png")]);
        useFileStore.getState().setProcessing(true);
      });

      // Even if the orphaned request resolves after unmount and reset, it writes nothing.
      await act(async () => {
        resolveFetch(goodResponse());
      });

      expect(useFileStore.getState().processing).toBe(true);
      expect(useFileStore.getState().processedUrl).toBeNull();
      expect(useFileStore.getState().error).toBeNull();
      expect(anchorClickSpy).not.toHaveBeenCalled();
      anchorClickSpy.mockRestore();
    });

    it("ignores a late 500 or network error when an orphaned request fails after store reset", async () => {
      for (const mode of ["500", "reject"] as const) {
        let resolveFetch: (res: Response) => void = () => {};
        let rejectFetch: (err: unknown) => void = () => {};
        vi.stubGlobal(
          "fetch",
          vi.fn(
            (_url: string, init?: RequestInit) =>
              new Promise<Response>((resolve, reject) => {
                fetchSignals.push(init?.signal ?? undefined);
                resolveFetch = resolve;
                rejectFetch = reject;
              }),
          ),
        );

        useFileStore.getState().reset();
        useFileStore.getState().setFiles([image()]);
        const { container, unmount } = render(<Panel />);
        if (needsSecondaryFile) chooseSecondaryFile(container);
        fireEvent.click(screen.getByTestId(submitId));

        unmount();
        act(() => {
          useFileStore.getState().reset();
          useFileStore.getState().setFiles([image("next.png")]);
          useFileStore.getState().setProcessing(true);
        });

        await act(async () => {
          if (mode === "500") {
            resolveFetch(new Response(JSON.stringify({ error: "Server failed" }), { status: 500 }));
          } else {
            rejectFetch(new TypeError("Failed to fetch"));
          }
        });

        expect(useFileStore.getState().processing).toBe(true);
        expect(useFileStore.getState().error).toBeNull();
      }
    });
  },
);

describe("watermark-image multi-file loop (#2636)", () => {
  it("aborts the active file request on unmount, stops the loop, and resets the processing entry", async () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const { container, unmount } = render(<WatermarkImageSettings />);
    chooseSecondaryFile(container, image("wm.png"));

    fireEvent.click(screen.getByTestId("watermark-image-submit"));
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().entries[0].status).toBe("processing");
    expect(pendingFetches).toHaveLength(1);

    unmount();
    await act(async () => {});

    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(pendingFetches).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().error).toBe(INTERRUPTED);
    expect(useFileStore.getState().entries[0].status).toBe("pending");
  });

  it("stops looping and does not write to useFileStore when reset mid-batch", async () => {
    let resolveFirst: (res: Response) => void = () => {};
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        calls.push(url);
        fetchSignals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }),
    );

    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const { container, unmount } = render(<WatermarkImageSettings />);
    chooseSecondaryFile(container, image("wm.png"));

    fireEvent.click(screen.getByTestId("watermark-image-submit"));
    expect(calls).toHaveLength(1);

    act(() => {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("other.png")]);
      useFileStore.getState().setProcessing(true);
    });
    unmount();

    await act(async () => {
      resolveFirst(
        new Response(
          JSON.stringify({
            jobId: "j-1",
            downloadUrl: "/api/v1/download/j-1/out.png",
            originalSize: 100,
            processedSize: 90,
          }),
          { status: 200 },
        ),
      );
    });

    expect(calls).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(true);
    expect(useFileStore.getState().entries[0].file.name).toBe("other.png");
    expect(useFileStore.getState().entries[0].status).toBe("pending");
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
  });

  it("reports an entry reset failure via reportRunEndFailure if updateEntry throws on unmount", () => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    const { container, unmount } = render(<WatermarkImageSettings />);
    chooseSecondaryFile(container, image("wm.png"));
    fireEvent.click(screen.getByTestId("watermark-image-submit"));

    const realUpdateEntry = useFileStore.getState().updateEntry;
    vi.spyOn(useFileStore.getState(), "updateEntry").mockImplementation(() => {
      throw new Error("entry reset boom");
    });

    try {
      expect(() => unmount()).not.toThrow();
    } finally {
      useFileStore.setState({ updateEntry: realUpdateEntry });
    }

    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(captureHandledError).mock.calls[0][0].message).toBe(
      "Failing a tool run's entries failed",
    );
  });
});

describe("own-store tool handlers abort and ignore late completions on store reset (#2636)", () => {
  it("split: aborts in-flight fetch on useSplitStore.reset() and ignores late completion", async () => {
    let resolveFirst: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }),
    );

    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    render(<SplitSettings />);
    fireEvent.click(screen.getByTestId("split-submit"));
    await vi.waitFor(() => expect(fetchSignals).toHaveLength(1));
    expect(useSplitStore.getState().processing).toBe(true);

    act(() => {
      useSplitStore.getState().reset();
    });

    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(useSplitStore.getState().processing).toBe(false);

    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile("tile_r0_c0.png", Buffer.from([1, 2, 3]));
    const zipBytes = new Uint8Array(zip.toBuffer());

    await act(async () => {
      resolveFirst({
        ok: true,
        status: 200,
        blob: async () => zipBytes as unknown as Blob,
      } as Response);
    });

    expect(fetchSignals).toHaveLength(1);
    expect(useSplitStore.getState().tiles).toEqual([]);
    expect(useSplitStore.getState().zipBlobUrl).toBeNull();
    expect(useSplitStore.getState().processing).toBe(false);
    expect(useSplitStore.getState().error).toBeNull();
  });

  it("split: revokes intermediate tile blob URLs and clears processing when files are cleared mid-batch", async () => {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile("tile_r0_c0.png", Buffer.from([1, 2, 3]));
    const zipBytes = new Uint8Array(zip.toBuffer());

    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        callCount++;
        fetchSignals.push(init?.signal ?? undefined);
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            blob: async () => zipBytes as unknown as Blob,
          } as Response);
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }),
    );

    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    render(<SplitSettings />);
    fireEvent.click(screen.getByTestId("split-submit"));
    await vi.waitFor(() => expect(fetchSignals).toHaveLength(2));
    expect(useSplitStore.getState().processing).toBe(true);

    vi.mocked(URL.revokeObjectURL).mockClear();
    act(() => {
      useFileStore.getState().reset();
    });
    await act(async () => {});

    expect(fetchSignals[1]?.aborted).toBe(true);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    expect(useSplitStore.getState().processing).toBe(false);
    expect(useSplitStore.getState().tiles).toEqual([]);
  });

  it("image-to-base64: aborts in-flight fetch on useBase64Store.reset() or useFileStore.reset() and stops looping", async () => {
    let resolveFirst: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }),
    );

    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    render(<ImageToBase64Settings />);
    fireEvent.click(screen.getByTestId("base64-submit"));
    expect(useBase64Store.getState().processing).toBe(true);
    expect(fetchSignals).toHaveLength(1);

    act(() => {
      useBase64Store.getState().reset();
    });

    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(useBase64Store.getState().processing).toBe(false);

    await act(async () => {
      resolveFirst(
        new Response(
          JSON.stringify({
            results: [
              {
                filename: "one.png",
                mimeType: "image/png",
                width: 1,
                height: 1,
                originalSize: 3,
                encodedSize: 4,
                overheadPercent: 33,
                base64: "YWJj",
                dataUri: "data:image/png;base64,YWJj",
              },
            ],
            errors: [],
          }),
          { status: 200 },
        ),
      );
    });

    expect(fetchSignals).toHaveLength(1);
    expect(useBase64Store.getState().results).toEqual([]);
    expect(useBase64Store.getState().errors).toEqual([]);
    expect(useBase64Store.getState().processing).toBe(false);

    // Also verify clearing useFileStore mid-run clears useBase64Store.processing.
    fireEvent.click(screen.getByTestId("base64-submit"));
    expect(useBase64Store.getState().processing).toBe(true);
    expect(fetchSignals).toHaveLength(2);

    act(() => {
      useFileStore.getState().reset();
    });
    await act(async () => {
      resolveFirst(new Response(JSON.stringify({ error: "Failed" }), { status: 500 }));
    });

    expect(fetchSignals[1]?.aborted).toBe(true);
    expect(useBase64Store.getState().processing).toBe(false);
    expect(useBase64Store.getState().errors).toEqual([]);
  });

  it("collage: aborts XHR and post-XHR delay on useCollageStore.reset() or clearImages() and ignores late completion", async () => {
    useCollageStore.getState().addImages([image("one.png"), image("two.png")]);
    render(<CollageSettings />);
    fireEvent.click(screen.getByTestId("collage-submit"));
    expect(FakeXhr.instances).toHaveLength(1);
    const xhr = FakeXhr.instances[0];

    act(() => {
      useCollageStore.getState().reset();
    });

    expect(xhr.aborted).toBe(true);
    expect(useCollageStore.getState().phase).toBe("upload");

    act(() => {
      xhr.status = 200;
      xhr.responseText = JSON.stringify({
        jobId: "j-col",
        downloadUrl: "/api/v1/download/j-col/collage.png",
        originalSize: 200,
        processedSize: 150,
      });
      xhr.onload?.();
    });
    await act(async () => {});

    expect(useCollageStore.getState().resultUrl).toBeNull();
    expect(useCollageStore.getState().phase).toBe("upload");
    expect(useCollageStore.getState().error).toBeNull();

    // Also test resetting during the post-XHR 800ms delay (after xhr.onload 200).
    act(() => {
      useCollageStore.getState().addImages([image("one.png"), image("two.png")]);
    });
    fireEvent.click(screen.getByTestId("collage-submit"));
    expect(FakeXhr.instances).toHaveLength(2);
    const xhr2 = FakeXhr.instances[1];

    act(() => {
      xhr2.status = 200;
      xhr2.responseText = JSON.stringify({
        jobId: "j-col-2",
        downloadUrl: "/api/v1/download/j-col-2/collage.png",
        originalSize: 200,
        processedSize: 150,
      });
      xhr2.onload?.();
      // Now inside the 800ms delay: clearImages cancels the delay immediately.
      useCollageStore.getState().clearImages();
    });
    await act(async () => {});

    expect(useCollageStore.getState().resultUrl).toBeNull();
    expect(useCollageStore.getState().phase).toBe("upload");
  });

  it("passport-photo: aborts analyze and generate fetches on reset(), file change, and ANALYSIS_EXPIRED", async () => {
    let resolveAnalyze: (res: Response) => void = () => {};
    let resolveGenerate: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        fetchSignals.push(init?.signal ?? undefined);
        if (url.includes("/analyze")) {
          return new Promise<Response>((resolve) => {
            resolveAnalyze = resolve;
          });
        }
        return new Promise<Response>((resolve) => {
          resolveGenerate = resolve;
        });
      }),
    );

    render(<PassportPhotoSettings />);
    expect(usePassportPhotoStore.getState().analyzing).toBe(true);
    expect(fetchSignals).toHaveLength(1);

    act(() => {
      usePassportPhotoStore.getState().reset();
    });

    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(usePassportPhotoStore.getState().analyzing).toBe(false);

    await act(async () => {
      resolveAnalyze(new Response(JSON.stringify(PASSPORT_ANALYZE_RESULT), { status: 200 }));
    });

    expect(usePassportPhotoStore.getState().analyzeResult).toBeNull();
    expect(usePassportPhotoStore.getState().analyzing).toBe(false);

    // Seed analyzeResult and test generate abort/reset.
    act(() => {
      usePassportPhotoStore.getState().setAnalyzeResult(PASSPORT_ANALYZE_RESULT);
    });
    fireEvent.click(screen.getByTestId("passport-photo-generate"));
    expect(usePassportPhotoStore.getState().generating).toBe(true);
    expect(fetchSignals).toHaveLength(2);

    act(() => {
      usePassportPhotoStore.getState().reset();
    });

    expect(fetchSignals[1]?.aborted).toBe(true);
    expect(usePassportPhotoStore.getState().generating).toBe(false);

    await act(async () => {
      resolveGenerate(
        new Response(
          JSON.stringify({
            downloadUrl: "/api/v1/download/passport-job-1/passport.jpg",
            dimensions: { width: 600, height: 600 },
            spec: { country: "US", document: "passport" },
          }),
          { status: 200 },
        ),
      );
    });

    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
    expect(usePassportPhotoStore.getState().generating).toBe(false);

    // Test ANALYSIS_EXPIRED (410) clears generating to false while re-running analyze.
    act(() => {
      usePassportPhotoStore.getState().setAnalyzeResult(PASSPORT_ANALYZE_RESULT);
    });
    fireEvent.click(screen.getByTestId("passport-photo-generate"));
    expect(usePassportPhotoStore.getState().generating).toBe(true);

    await act(async () => {
      resolveGenerate(new Response(JSON.stringify({ code: "ANALYSIS_EXPIRED" }), { status: 410 }));
    });

    expect(usePassportPhotoStore.getState().generating).toBe(false);
    expect(usePassportPhotoStore.getState().analyzing).toBe(true);

    await act(async () => {
      resolveAnalyze(new Response(JSON.stringify(PASSPORT_ANALYZE_RESULT), { status: 200 }));
    });

    expect(usePassportPhotoStore.getState().analyzing).toBe(false);
    expect(usePassportPhotoStore.getState().analyzeResult).toEqual(PASSPORT_ANALYZE_RESULT);
  });

  it("html-to-image: aborts capture on useHtmlToImageStore.reset() and ignores late 200 or 500", async () => {
    let resolveCapture: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolveCapture = resolve;
        });
      }),
    );

    useHtmlToImageStore.getState().setUrl("https://example.com");
    const capturePromise = useHtmlToImageStore.getState().capture();
    expect(useHtmlToImageStore.getState().capturing).toBe(true);
    expect(fetchSignals).toHaveLength(1);

    useHtmlToImageStore.getState().reset();

    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(useHtmlToImageStore.getState().capturing).toBe(false);

    resolveCapture(
      new Response(JSON.stringify({ downloadUrl: "/dl/shot.png", processedSize: 500 }), {
        status: 200,
      }),
    );
    await capturePromise;

    expect(useHtmlToImageStore.getState().resultUrl).toBeNull();
    expect(useHtmlToImageStore.getState().capturing).toBe(false);
    expect(useHtmlToImageStore.getState().error).toBeNull();

    // Non-controller AbortError (e.g. window.stop()) still clears capturing.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new DOMException("Stopped", "AbortError"))),
    );
    useHtmlToImageStore.getState().setUrl("https://example.com");
    await useHtmlToImageStore.getState().capture();
    expect(useHtmlToImageStore.getState().capturing).toBe(false);
  });

  it("pdf-to-image: aborts loadPreview and convert on reset() or setFile() and ignores late completion", async () => {
    let resolveRequest: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        });
      }),
    );

    const pdfFile = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
    const previewPromise = usePdfToImageStore.getState().loadPreview(pdfFile);
    expect(usePdfToImageStore.getState().loadingPreview).toBe(true);
    expect(fetchSignals).toHaveLength(1);

    usePdfToImageStore.getState().reset();
    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(usePdfToImageStore.getState().loadingPreview).toBe(false);

    resolveRequest(new Response(JSON.stringify({ pageCount: 3, thumbnails: [] }), { status: 200 }));
    await previewPromise;
    expect(usePdfToImageStore.getState().pageCount).toBeNull();

    usePdfToImageStore.setState({
      file: pdfFile,
      pageCount: 2,
      selectedPages: new Set([1, 2]),
    });
    const convertPromise = usePdfToImageStore.getState().convert();
    expect(usePdfToImageStore.getState().processing).toBe(true);
    expect(fetchSignals).toHaveLength(2);

    usePdfToImageStore.getState().reset();

    expect(fetchSignals[1]?.aborted).toBe(true);
    expect(usePdfToImageStore.getState().processing).toBe(false);

    resolveRequest(
      new Response(
        JSON.stringify({
          pages: [{ page: 1, downloadUrl: "/dl/p1.png", size: 100 }],
          zipUrl: "/dl/pages.zip",
          zipSize: 200,
        }),
        { status: 200 },
      ),
    );
    await convertPromise;

    expect(usePdfToImageStore.getState().results).toBeNull();
    expect(usePdfToImageStore.getState().zipUrl).toBeNull();
    expect(usePdfToImageStore.getState().processing).toBe(false);
    expect(usePdfToImageStore.getState().error).toBeNull();
  });

  it("meme-generator: aborts generateMeme on reset() or backToGallery() and ignores late completion", async () => {
    let resolveMeme: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        fetchSignals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolveMeme = resolve;
        });
      }),
    );

    useMemeStore.setState({
      phase: "editor",
      customLayout: "top-bottom",
      textBoxValues: [{ id: "top", text: "Hello" }],
    });
    const generatePromise = useMemeStore.getState().generateMeme();
    expect(useMemeStore.getState().generating).toBe(true);
    expect(fetchSignals).toHaveLength(1);

    useMemeStore.getState().reset();

    expect(fetchSignals[0]?.aborted).toBe(true);
    expect(useMemeStore.getState().generating).toBe(false);

    resolveMeme(
      new Response(
        JSON.stringify({
          jobId: "j-meme",
          downloadUrl: "/dl/meme.png",
          originalSize: 100,
          processedSize: 120,
        }),
        { status: 200 },
      ),
    );
    await generatePromise;

    expect(useMemeStore.getState().resultUrl).toBeNull();
    expect(useMemeStore.getState().downloadUrl).toBeNull();
    expect(useMemeStore.getState().phase).toBe("gallery");
    expect(useMemeStore.getState().generating).toBe(false);
    expect(useMemeStore.getState().error).toBeNull();

    // Custom file FormData branch + backToGallery abort.
    useMemeStore.setState({
      phase: "editor",
      customFile: image("custom.png"),
      customLayout: "top-bottom",
      textBoxValues: [{ id: "top", text: "Custom" }],
    });
    const customPromise = useMemeStore.getState().generateMeme();
    expect(useMemeStore.getState().generating).toBe(true);
    expect(fetchSignals).toHaveLength(2);

    useMemeStore.getState().backToGallery();
    expect(fetchSignals[1]?.aborted).toBe(true);
    expect(useMemeStore.getState().generating).toBe(false);

    resolveMeme(
      new Response(
        JSON.stringify({
          jobId: "j-meme-2",
          downloadUrl: "/dl/meme-2.png",
          originalSize: 100,
          processedSize: 120,
        }),
        { status: 200 },
      ),
    );
    await customPromise;

    expect(useMemeStore.getState().resultUrl).toBeNull();
    expect(useMemeStore.getState().phase).toBe("gallery");
  });
});
