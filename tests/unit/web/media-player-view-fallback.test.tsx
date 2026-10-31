// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  getDistinctId: () => null,
  captureHandledError: vi.fn(() => Promise.resolve(null)),
  setSentryTag: vi.fn(),
}));

import { MediaPlayerView } from "@/components/tools/media-player-view";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

const PROCESSED_URL = "/api/v1/download/job-42/output.ogv";
const PREVIEW_GENERATE_URL = "/api/v1/preview/generate";

beforeEach(() => {
  useFileStore.getState().reset();
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:preview",
    revokeObjectURL: () => {},
  });
  // Some Node versions put a method-less localStorage over jsdom's, and
  // I18nProvider reads the stored locale on mount.
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(sourcePayload: () => Promise<unknown>) {
  const fetchMock = vi.fn((input: string) => {
    if (input === PROCESSED_URL) {
      return sourcePayload();
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(new Blob(["preview-bytes"], { type: "video/mp4" })),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MediaPlayerView transcode fallback (#1503)", () => {
  it("previews the processed result when processedUrl is present", async () => {
    const inputFile = new File(["original-input-bytes"], "input.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([inputFile]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: PROCESSED_URL,
      processedFilename: "output.ogv",
      processedSize: 9999,
    });

    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob(["processed-ogv-bytes"], { type: "video/ogg" })),
      }),
    );

    render(
      <I18nProvider>
        <MediaPlayerView />
      </I18nProvider>,
    );

    // Trigger unsupported codec fallback (videoWidth === 0)
    const video = screen.getByTestId("media-player-video");
    fireEvent.loadedMetadata(video);

    // The NonNativePreview fallback is now rendered
    const generateBtn = screen.getByRole("button", { name: /generate preview/i });
    expect(generateBtn).toBeTruthy();
    expect(screen.getByText("output.ogv")).toBeTruthy();

    fireEvent.click(generateBtn);
    await act(async () => {});

    // Assert that the processed result was fetched, NOT the input file
    const sourceFetchCalls = fetchMock.mock.calls.filter(([url]) => url === PROCESSED_URL);
    expect(sourceFetchCalls).toHaveLength(1);

    const generateCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith(PREVIEW_GENERATE_URL),
    );
    expect(generateCalls).toHaveLength(1);

    const formData = generateCalls[0][1]?.body as FormData;
    const uploaded = formData.get("file") as File;
    expect(uploaded.name).toBe("output.ogv");
  });

  it("names a single-file result after its download URL, not the input", async () => {
    const inputFile = new File(["original-input-bytes"], "input.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([inputFile]);
    // Single-file runs store the download URL and leave processedFilename null.
    useFileStore.getState().updateEntry(0, { processedUrl: PROCESSED_URL, processedSize: 9999 });

    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob(["processed-ogv-bytes"], { type: "video/ogg" })),
      }),
    );

    render(
      <I18nProvider>
        <MediaPlayerView />
      </I18nProvider>,
    );

    fireEvent.loadedMetadata(screen.getByTestId("media-player-video"));
    expect(screen.getByText("output.ogv")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
    await act(async () => {});

    const generateCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith(PREVIEW_GENERATE_URL),
    );
    expect(generateCalls).toHaveLength(1);
    const formData = generateCalls[0][1]?.body as FormData;
    const uploaded = formData.get("file") as File;
    expect(uploaded.name).toBe("output.ogv");
  });

  it("previews the input file when no processed result exists", async () => {
    const inputFile = new File(["original-input-bytes"], "input.ogv", { type: "video/ogg" });
    useFileStore.getState().setFiles([inputFile]);

    const fetchMock = stubFetch(() => Promise.reject(new Error("Should not fetch source")));

    render(
      <I18nProvider>
        <MediaPlayerView />
      </I18nProvider>,
    );

    const video = screen.getByTestId("media-player-video");
    fireEvent.loadedMetadata(video);

    const generateBtn = screen.getByRole("button", { name: /generate preview/i });
    expect(generateBtn).toBeTruthy();
    expect(screen.getByText("input.ogv")).toBeTruthy();

    fireEvent.click(generateBtn);
    await act(async () => {});

    // Assert no remote source fetch was made
    const sourceFetchCalls = fetchMock.mock.calls.filter(([url]) => url === PROCESSED_URL);
    expect(sourceFetchCalls).toHaveLength(0);

    const generateCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith(PREVIEW_GENERATE_URL),
    );
    expect(generateCalls).toHaveLength(1);

    const formData = generateCalls[0][1]?.body as FormData;
    const uploaded = formData.get("file") as File;
    expect(uploaded.name).toBe("input.ogv");
  });
});

// Automate keeps one MediaPlayerView across selections (tool-page remounts it
// per index), so a flag left over from one file must not decide the next (#1709).
describe("MediaPlayerView fallback across selections (#1709)", () => {
  function loadTwo() {
    let n = 0;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => `blob:file-${++n}`,
      revokeObjectURL: () => {},
    });
    useFileStore
      .getState()
      .setFiles([
        new File(["ogv"], "theora.ogv", { type: "video/ogg" }),
        new File(["mp4"], "h264.mp4", { type: "video/mp4" }),
      ]);
  }

  it("plays the next file natively after one fell back", () => {
    loadTwo();
    render(
      <I18nProvider>
        <MediaPlayerView />
      </I18nProvider>,
    );

    fireEvent.loadedMetadata(screen.getByTestId("media-player-video"));
    expect(screen.getByRole("button", { name: /generate preview/i })).toBeTruthy();

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });

    expect(screen.getByTestId("media-player-video")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /generate preview/i })).toBeNull();
  });

  it("falls back again on returning to the unplayable file", () => {
    loadTwo();
    render(
      <I18nProvider>
        <MediaPlayerView />
      </I18nProvider>,
    );
    fireEvent.loadedMetadata(screen.getByTestId("media-player-video"));

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    const video = screen.getByTestId("media-player-video");
    Object.defineProperty(video, "videoWidth", { value: 640 });
    fireEvent.loadedMetadata(video);
    expect(screen.getByTestId("media-player-video")).toBeTruthy();

    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });

    expect(screen.getByRole("button", { name: /generate preview/i })).toBeTruthy();
  });

  // On Automate the player also stays mounted when a result lands, so the
  // result gets its own chance to play natively.
  it("tries a result natively after its input fell back", () => {
    loadTwo();
    render(
      <I18nProvider>
        <MediaPlayerView />
      </I18nProvider>,
    );
    fireEvent.loadedMetadata(screen.getByTestId("media-player-video"));
    expect(screen.getByRole("button", { name: /generate preview/i })).toBeTruthy();

    act(() => {
      useFileStore.getState().updateEntry(0, { processedUrl: PROCESSED_URL });
    });

    const video = screen.getByTestId("media-player-video");
    expect(video.getAttribute("src")).toBe(PROCESSED_URL);

    // The result can't be decoded either: back to the fallback, for the result.
    fireEvent.loadedMetadata(video);
    expect(screen.getByRole("button", { name: /generate preview/i })).toBeTruthy();
    expect(screen.getByText("output.ogv")).toBeTruthy();
  });

  it("falls back when the browser rejects the container outright", () => {
    loadTwo();
    render(
      <I18nProvider>
        <MediaPlayerView />
      </I18nProvider>,
    );

    fireEvent.error(screen.getByTestId("media-player-video"));

    expect(screen.queryByTestId("media-player-video")).toBeNull();
    expect(screen.getByRole("button", { name: /generate preview/i })).toBeTruthy();
    expect(screen.getByText("theora.ogv")).toBeTruthy();
  });
});
