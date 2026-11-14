// @vitest-environment jsdom

/**
 * #4666 (Sentry WEB-2M): the media-player area sent every file whose extension
 * <video> can't play to the server preview transcode, including a GIF input
 * (gif-to-video) and results that aren't video at all (a ZIP of frames, a
 * subtitle file). The transcode answers 400 for those, so the user got a
 * "preview failed" panel and Sentry got a report.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

vi.mock("@/components/tools/document-view", () => ({
  DocumentView: () => <div data-testid="document-canvas" />,
}));

import { I18nProvider } from "@/contexts/i18n-context";
import { ToolPage } from "@/pages/tool-page";
import { useFileStore } from "@/stores/file-store";

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

function renderToolPage(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:original-input",
    revokeObjectURL: () => {},
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ authEnabled: false }), { status: 200 })),
    ),
  );
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const previewRequests = () =>
  (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) =>
    String(url).includes("/preview/generate"),
  );

async function loadInput(file: File) {
  await act(async () => {
    useFileStore.getState().setFiles([file]);
  });
}

async function completeWith(processedFilename: string) {
  await act(async () => {
    useFileStore.getState().updateEntry(0, {
      status: "completed",
      processedUrl: `/api/v1/download/job-1/${processedFilename}`,
      processedFilename,
      processedSize: 2048,
    });
  });
}

describe("ToolPage media-player area routing (#4666)", () => {
  it("shows a GIF input as an image instead of offering a server preview", async () => {
    renderToolPage("/video/gif-to-video");
    await loadInput(new File(["GIF89a"], "loop.gif", { type: "image/gif" }));

    await waitFor(() => {
      expect(screen.getByRole("img").getAttribute("src")).toBe("blob:original-input");
    });
    expect(screen.queryByRole("button", { name: /Generate Preview/i })).toBeNull();
    expect(previewRequests()).toHaveLength(0);
  });

  // auto-subtitles' .srt takes the same path (videoAreaView in
  // result-display.test.ts); its page needs the AI feature list to render.
  it("shows the conversion card for a ZIP of frames the transcode can't preview", async () => {
    renderToolPage("/video/video-to-frames");
    await loadInput(new File(["video-bytes"], "clip.mp4", { type: "video/mp4" }));
    await completeWith("clip-frames.zip");

    expect(screen.getByText("Conversion complete", { selector: "p" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Generate Preview/i })).toBeNull();
    expect(previewRequests()).toHaveLength(0);
  });

  it("still offers the server preview for a video the browser can't play", async () => {
    renderToolPage("/video/compress-video");
    await loadInput(new File(["video-bytes"], "clip.mkv", { type: "video/x-matroska" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Generate Preview/i })).toBeTruthy();
    });
  });
});
