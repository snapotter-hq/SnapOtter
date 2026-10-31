// @vitest-environment jsdom
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

describe("ToolPage conversion-complete card for media-player and document modes (#2449)", () => {
  it("shows conversion complete card instead of MediaPlayerView when a video batch skips ZIP extraction", async () => {
    renderToolPage("/video/compress-video");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["video-bytes"], "clip.mp4", { type: "video/mp4" })]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: null,
        processedFilename: "clip-compressed.mp4",
        processedSize: null,
      });
    });

    expect(screen.getByText("Conversion complete", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("clip-compressed.mp4")).toBeTruthy();
    expect(screen.queryByTestId("media-player-video")).toBeNull();
  });

  it("renders MediaPlayerView for a single-file video result with an /api/... download URL", async () => {
    renderToolPage("/video/compress-video");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["video-bytes"], "clip.mp4", { type: "video/mp4" })]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "/api/v1/download/job-1/clip-compressed.mp4",
        processedFilename: null,
        processedSize: 4096,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("media-player-video")).toBeTruthy();
    });
    expect(screen.getByTestId("media-player-video").getAttribute("src")).toBe(
      "/api/v1/download/job-1/clip-compressed.mp4",
    );
    expect(screen.queryByText("Conversion complete", { selector: "p" })).toBeNull();
  });

  it("shows conversion complete card instead of DocumentView when a PDF batch skips ZIP extraction", async () => {
    renderToolPage("/pdf/rotate-pdf");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" })]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: null,
        processedFilename: "doc-rotated.pdf",
        processedSize: null,
      });
    });

    expect(screen.getByText("Conversion complete", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("doc-rotated.pdf")).toBeTruthy();
    expect(screen.queryByTestId("document-canvas")).toBeNull();
  });

  it("renders DocumentView for a single-file PDF result with an /api/... download URL", async () => {
    renderToolPage("/pdf/rotate-pdf");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["%PDF-1.4"], "doc.pdf", { type: "application/pdf" })]);
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        processedUrl: "/api/v1/download/job-1/doc-rotated.pdf",
        processedFilename: null,
        processedSize: 2048,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("document-canvas")).toBeTruthy();
    });
    expect(screen.queryByText("Conversion complete", { selector: "p" })).toBeNull();
  });
});
